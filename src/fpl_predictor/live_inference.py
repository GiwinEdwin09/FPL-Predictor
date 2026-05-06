from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from fpl_predictor.feature_factory import build_pre_match_feature_table
from fpl_predictor.model_training import (
    FEATURE_COLUMNS,
    add_derived_features,
    add_sorting_columns,
    apply_temperature,
)
from fpl_predictor.web_dashboard import (
    CURRENT_SEASON,
    build_historical_matches_from_frames,
    build_prediction_groups_from_frame,
    coerce_float,
    coerce_int,
    load_model,
    load_model_metadata,
    load_team_lookup,
    serialize_prediction_fixture,
    serialize_team,
)

PLAYER_METRIC_COLUMNS = (
    "xg",
    "xa",
    "shots_on_target",
    "chances_created",
    "touches_opposition_box",
    "tackles_won",
    "tackles",
    "interceptions",
    "recoveries",
    "clearances",
    "blocks",
)
DEFAULT_SIMULATION_RATIO_LIMITS = (0.65, 1.35)


@dataclass(frozen=True)
class InferencePaths:
    data_dir: Path
    matches_path: Path
    players_path: Path
    playerstats_path: Path
    playermatchstats_path: Path
    model_path: Path
    metrics_path: Path


@dataclass
class RuntimeState:
    signature: tuple[tuple[str, int], ...]
    matches: pd.DataFrame
    features: pd.DataFrame
    model: Any
    temperature: float
    model_metadata: dict[str, Any]
    team_lookup: dict[tuple[str, int], dict[str, Any]]
    players: pd.DataFrame
    playerstats: pd.DataFrame
    player_matches: pd.DataFrame


def _mtime(path: Path) -> int:
    try:
        return path.stat().st_mtime_ns
    except FileNotFoundError:
        return -1


def _safe_numeric(value: Any, fallback: float = 0.0) -> float:
    if pd.isna(value):
        return fallback
    return float(value)


def _is_available(status: str | None, chance: float | None) -> bool:
    normalized = (status or "").strip().casefold()
    if normalized in {"i", "u", "s"}:
        return False
    if chance is not None and chance <= 0:
        return False
    return True


def _position_bucket(value: Any) -> str:
    normalized = str(value or "").strip().casefold()
    if normalized.startswith("goal"):
        return "goalkeeper"
    if normalized.startswith("def"):
        return "defender"
    if normalized.startswith("mid"):
        return "midfielder"
    if normalized.startswith("for"):
        return "forward"
    return "unknown"


def _fixture_cutoff(
    fixture_row: pd.Series,
) -> tuple[pd.Timestamp | None, int | None]:
    kickoff_time = fixture_row.get("kickoff_time")
    kickoff = None
    if pd.notna(kickoff_time):
        kickoff = pd.Timestamp(kickoff_time)
        if kickoff.tzinfo is None:
            kickoff = kickoff.tz_localize("UTC")
    gameweek = coerce_int(fixture_row.get("source_gameweek")) or coerce_int(fixture_row.get("gameweek"))
    return kickoff, gameweek


def _row_before_fixture(
    row: pd.Series,
    *,
    season: str,
    cutoff_kickoff: pd.Timestamp | None,
    cutoff_gameweek: int | None,
) -> bool:
    if str(row.get("source_season")) != season:
        return False

    kickoff_time = row.get("kickoff_time")
    if cutoff_kickoff is not None and pd.notna(kickoff_time):
        kickoff = pd.Timestamp(kickoff_time)
        if kickoff.tzinfo is None:
            kickoff = kickoff.tz_localize("UTC")
        return kickoff < cutoff_kickoff

    if cutoff_gameweek is None:
        return False

    row_gameweek = coerce_int(row.get("source_gameweek")) or coerce_int(row.get("gameweek"))
    if row_gameweek is None:
        return False
    return row_gameweek < cutoff_gameweek


def _clip_ratio(value: float) -> float:
    lower, upper = DEFAULT_SIMULATION_RATIO_LIMITS
    return max(lower, min(upper, value))


class LiveInferenceService:
    def __init__(self, paths: InferencePaths) -> None:
        self.paths = paths
        self._state: RuntimeState | None = None
        self._projected_lineup_cache: dict[tuple[Any, ...], dict[str, Any]] = {}
        self._fixture_lineup_context_cache: dict[tuple[Any, ...], dict[str, Any]] = {}
        self._player_form_metrics_cache: dict[tuple[Any, ...], dict[str, float]] = {}
        self._lineup_metrics_cache: dict[tuple[Any, ...], dict[str, float]] = {}

    def _reset_caches(self) -> None:
        self._projected_lineup_cache.clear()
        self._fixture_lineup_context_cache.clear()
        self._player_form_metrics_cache.clear()
        self._lineup_metrics_cache.clear()

    def _cutoff_cache_key(
        self,
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
    ) -> tuple[str | None, int | None]:
        kickoff_key = cutoff_kickoff.isoformat() if cutoff_kickoff is not None and pd.notna(cutoff_kickoff) else None
        return kickoff_key, cutoff_gameweek

    def _signature(self) -> tuple[tuple[str, int], ...]:
        raw_root = self.paths.data_dir / "raw"
        team_files = sorted(raw_root.glob("*/teams.csv"))
        watched = [
            self.paths.matches_path,
            self.paths.players_path,
            self.paths.playerstats_path,
            self.paths.playermatchstats_path,
            self.paths.model_path,
            self.paths.metrics_path,
            *team_files,
        ]
        return tuple((str(path), _mtime(path)) for path in watched)

    def _load_state(self, signature: tuple[tuple[str, int], ...]) -> RuntimeState:
        matches = pd.read_csv(self.paths.matches_path)
        features = build_pre_match_feature_table(matches, competition_scope="premier_league")
        features = add_sorting_columns(features)
        features = add_derived_features(features)

        temperature, model_metadata = load_model_metadata(self.paths.metrics_path)
        model = load_model(self.paths.model_path)
        team_lookup = load_team_lookup(self.paths.data_dir)

        players = pd.read_csv(self.paths.players_path)
        players["position_bucket"] = players["position"].map(_position_bucket)

        playerstats = pd.read_csv(self.paths.playerstats_path, low_memory=False)
        playerstats["source_gameweek"] = pd.to_numeric(playerstats.get("source_gameweek"), errors="coerce")
        playerstats["form"] = pd.to_numeric(playerstats.get("form"), errors="coerce")

        player_matches = pd.read_csv(self.paths.playermatchstats_path)
        player_matches["source_gameweek"] = pd.to_numeric(player_matches.get("source_gameweek"), errors="coerce")
        player_matches = player_matches.merge(
            players[
                [
                    "player_id",
                    "team_code",
                    "web_name",
                    "position",
                    "position_bucket",
                    "source_season",
                ]
            ].drop_duplicates(subset=["player_id", "source_season"]),
            on=["player_id", "source_season"],
            how="left",
        )
        player_matches = player_matches.merge(
            matches[
                [
                    "match_id",
                    "source_season",
                    "kickoff_time",
                    "source_gameweek",
                    "gameweek",
                    "home_team",
                    "away_team",
                ]
            ].rename(columns={"source_gameweek": "match_source_gameweek", "gameweek": "match_gameweek"}),
            on=["match_id", "source_season"],
            how="left",
        )
        player_matches["kickoff_time"] = pd.to_datetime(
            player_matches["kickoff_time"],
            errors="coerce",
            utc=True,
            format="mixed",
        )
        player_matches = player_matches.loc[
            (player_matches["team_code"] == player_matches["home_team"])
            | (player_matches["team_code"] == player_matches["away_team"])
        ].copy()

        return RuntimeState(
            signature=signature,
            matches=matches,
            features=features,
            model=model,
            temperature=temperature,
            model_metadata=model_metadata,
            team_lookup=team_lookup,
            players=players,
            playerstats=playerstats,
            player_matches=player_matches,
        )

    def state(self, refresh: bool = False) -> RuntimeState:
        signature = self._signature()
        if refresh or self._state is None or self._state.signature != signature:
            self._state = self._load_state(signature)
            self._reset_caches()
        return self._state

    def refresh(self) -> RuntimeState:
        return self.state(refresh=True)

    def dashboard_payload(self, refresh: bool = False) -> dict[str, Any]:
        state = self.state(refresh=refresh)
        current_gameweek, current_fixtures, upcoming_fixtures, postponed_fixtures = build_prediction_groups_from_frame(
            state.features,
            model=state.model,
            temperature=state.temperature,
            team_lookup=state.team_lookup,
        )
        return {
            "generatedAtUtc": datetime.now(UTC).isoformat(),
            "currentSeason": CURRENT_SEASON,
            "model": {
                "version": self.paths.model_path.stem,
                "calibrationTemperature": state.temperature,
                "metrics": state.model_metadata.get("metrics", {}),
                "split": state.model_metadata.get("split", {}),
                "competitionDistributionTrain": state.model_metadata.get("competition_distribution_train", {}),
            },
            "currentGameweek": current_gameweek,
            "currentGameweekFixtures": current_fixtures,
            "upcomingFixtures": upcoming_fixtures,
            "postponedFixtures": postponed_fixtures,
            "historicalMatches": build_historical_matches_from_frames(
                state.matches,
                state.features,
                team_lookup=state.team_lookup,
            ),
        }

    def _baseline_fixture(self, match_id: str, *, refresh: bool = False) -> tuple[RuntimeState, pd.Series, dict[str, Any]]:
        state = self.state(refresh=refresh)
        fixture_frame = state.features.loc[state.features["match_id"] == match_id].copy()
        if fixture_frame.empty:
            raise KeyError(f"Unknown match_id: {match_id}")
        fixture_row = fixture_frame.iloc[0]
        probabilities = state.model.predict_proba(fixture_frame.loc[:, FEATURE_COLUMNS])
        probabilities = apply_temperature(probabilities, state.temperature)
        serialized = serialize_prediction_fixture(
            fixture_row.to_dict(),
            probabilities[0],
            state.team_lookup,
        )
        return state, fixture_row, serialized

    def _latest_playerstats_snapshot(
        self,
        state: RuntimeState,
        *,
        season: str,
        player_ids: list[int],
        gameweek: int | None,
    ) -> pd.DataFrame:
        subset = state.playerstats.loc[
            (state.playerstats["source_season"] == season)
            & state.playerstats["id"].isin(player_ids)
        ].copy()
        if subset.empty:
            return subset

        if gameweek is not None:
            filtered = subset.loc[
                subset["source_gameweek"].isna() | (subset["source_gameweek"] <= gameweek)
            ].copy()
            if not filtered.empty:
                subset = filtered

        subset = subset.sort_values(["id", "source_gameweek"], kind="stable", na_position="last")
        return subset.groupby("id", as_index=False).tail(1)

    def _recent_player_summaries(
        self,
        state: RuntimeState,
        *,
        season: str,
        team_id: int,
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
    ) -> pd.DataFrame:
        frame = state.player_matches.loc[
            (state.player_matches["source_season"] == season)
            & (state.player_matches["team_code"] == team_id)
        ].copy()
        if frame.empty:
            return frame

        frame = frame.loc[
            frame.apply(
                lambda row: _row_before_fixture(
                    row,
                    season=season,
                    cutoff_kickoff=cutoff_kickoff,
                    cutoff_gameweek=cutoff_gameweek,
                ),
                axis=1,
            )
        ].copy()
        if frame.empty:
            return frame

        frame = frame.sort_values(
            ["kickoff_time", "match_source_gameweek", "match_id", "start_min", "minutes_played"],
            ascending=[False, False, False, True, False],
            kind="stable",
            na_position="last",
        )
        frame = frame.groupby("player_id", as_index=False, sort=False).head(5)
        frame["recent_starter"] = frame["start_min"].fillna(999) <= 5
        summary = (
            frame.groupby("player_id", as_index=False)
            .agg(
                recent_matches=("match_id", "count"),
                recent_starts=("recent_starter", "sum"),
                recent_minutes=("minutes_played", "sum"),
                recent_average_minutes=("minutes_played", "mean"),
            )
        )
        return summary

    def _team_candidates(
        self,
        state: RuntimeState,
        *,
        season: str,
        team_id: int,
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
    ) -> pd.DataFrame:
        candidates = state.players.loc[
            (state.players["source_season"] == season)
            & (state.players["team_code"] == team_id)
            & (state.players["position_bucket"] != "unknown")
        ].copy()
        if candidates.empty:
            return candidates

        player_ids = [int(value) for value in candidates["player_id"].dropna().unique().tolist()]
        snapshots = self._latest_playerstats_snapshot(
            state,
            season=season,
            player_ids=player_ids,
            gameweek=cutoff_gameweek,
        ).rename(
            columns={
                "id": "player_id",
                "minutes": "season_minutes",
                "starts": "season_starts",
                "chance_of_playing_this_round": "chance_play_this_round",
            }
        )
        recent = self._recent_player_summaries(
            state,
            season=season,
            team_id=team_id,
            cutoff_kickoff=cutoff_kickoff,
            cutoff_gameweek=cutoff_gameweek,
        )
        candidates = candidates.merge(
            snapshots[
                [
                    "player_id",
                    "status",
                    "chance_play_this_round",
                    "form",
                    "season_minutes",
                    "season_starts",
                    "news",
                ]
            ] if not snapshots.empty else pd.DataFrame(columns=[
                "player_id",
                "status",
                "chance_play_this_round",
                "form",
                "season_minutes",
                "season_starts",
                "news",
            ]),
            on="player_id",
            how="left",
        )
        candidates = candidates.merge(
            recent if not recent.empty else pd.DataFrame(
                columns=["player_id", "recent_matches", "recent_starts", "recent_minutes", "recent_average_minutes"]
            ),
            on="player_id",
            how="left",
        )
        candidates["chance_play_this_round"] = pd.to_numeric(candidates["chance_play_this_round"], errors="coerce").fillna(100.0)
        candidates["form"] = pd.to_numeric(candidates["form"], errors="coerce").fillna(0.0)
        candidates["season_minutes"] = pd.to_numeric(candidates["season_minutes"], errors="coerce").fillna(0.0)
        candidates["season_starts"] = pd.to_numeric(candidates["season_starts"], errors="coerce").fillna(0.0)
        candidates["recent_matches"] = pd.to_numeric(candidates["recent_matches"], errors="coerce").fillna(0.0)
        candidates["recent_starts"] = pd.to_numeric(candidates["recent_starts"], errors="coerce").fillna(0.0)
        candidates["recent_minutes"] = pd.to_numeric(candidates["recent_minutes"], errors="coerce").fillna(0.0)
        candidates["recent_average_minutes"] = pd.to_numeric(candidates["recent_average_minutes"], errors="coerce").fillna(0.0)
        candidates["available"] = candidates.apply(
            lambda row: _is_available(
                row.get("status"),
                _safe_numeric(row.get("chance_play_this_round"), 100.0),
            ),
            axis=1,
        )
        candidates["lineup_score"] = (
            candidates["recent_starts"] * 250
            + candidates["recent_minutes"] * 1.2
            + candidates["season_starts"] * 18
            + candidates["form"] * 20
            + candidates["chance_play_this_round"] * 0.8
            + candidates["available"].astype(int) * 100
        )
        return candidates.sort_values(
            ["available", "lineup_score", "recent_starts", "recent_minutes", "season_starts"],
            ascending=[False, False, False, False, False],
            kind="stable",
        ).reset_index(drop=True)

    def _select_lineup(self, candidates: pd.DataFrame) -> list[int]:
        if candidates.empty:
            return []

        selected: list[int] = []

        def take(bucket: str, count: int) -> None:
            nonlocal selected
            subset = candidates.loc[
                (candidates["position_bucket"] == bucket)
                & ~candidates["player_id"].isin(selected)
            ]
            selected.extend(subset.head(count)["player_id"].astype(int).tolist())

        take("goalkeeper", 1)
        take("defender", 3)
        take("midfielder", 2)
        take("forward", 1)

        remaining = candidates.loc[
            candidates["position_bucket"].isin({"defender", "midfielder", "forward"})
            & ~candidates["player_id"].isin(selected)
        ]
        selected.extend(remaining.head(max(0, 11 - len(selected)))["player_id"].astype(int).tolist())

        if len(selected) < 11:
            fallback = candidates.loc[~candidates["player_id"].isin(selected)]
            selected.extend(fallback.head(11 - len(selected))["player_id"].astype(int).tolist())

        return selected[:11]

    def _candidate_payload(self, row: pd.Series) -> dict[str, Any]:
        return {
            "playerId": int(row["player_id"]),
            "name": row.get("web_name") or f"Player {int(row['player_id'])}",
            "position": row.get("position"),
            "status": row.get("status"),
            "chanceOfPlayingThisRound": coerce_float(row.get("chance_play_this_round"), 0),
            "form": coerce_float(row.get("form")),
            "recentStarts": coerce_int(row.get("recent_starts")),
            "recentMinutes": coerce_int(row.get("recent_minutes")),
            "lineupScore": coerce_float(row.get("lineup_score")),
            "available": bool(row.get("available")),
            "news": None if pd.isna(row.get("news")) else str(row.get("news")),
        }

    def projected_lineup(
        self,
        *,
        season: str,
        team_id: int,
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
        refresh: bool = False,
    ) -> dict[str, Any]:
        state = self.state(refresh=refresh)
        lineup_key = (
            state.signature,
            season,
            team_id,
            *self._cutoff_cache_key(cutoff_kickoff, cutoff_gameweek),
        )
        cached = self._projected_lineup_cache.get(lineup_key)
        if cached is not None:
            return deepcopy(cached)

        candidates = self._team_candidates(
            state,
            season=season,
            team_id=team_id,
            cutoff_kickoff=cutoff_kickoff,
            cutoff_gameweek=cutoff_gameweek,
        )
        lineup_ids = self._select_lineup(candidates)
        lineup_rows = candidates.loc[candidates["player_id"].isin(lineup_ids)].copy()
        lineup_rows["selection_order"] = lineup_rows["player_id"].map({player_id: idx for idx, player_id in enumerate(lineup_ids)})
        lineup_rows = lineup_rows.sort_values("selection_order", kind="stable")

        payload = {
            "team": serialize_team(state.team_lookup, season, team_id),
            "lineup": [self._candidate_payload(row) for _, row in lineup_rows.iterrows()],
            "roster": [self._candidate_payload(row) for _, row in candidates.head(25).iterrows()],
        }
        self._projected_lineup_cache[lineup_key] = payload
        return deepcopy(payload)

    def fixture_lineup_context(self, match_id: str, *, refresh: bool = False) -> dict[str, Any]:
        state, fixture_row, baseline_fixture = self._baseline_fixture(match_id, refresh=refresh)
        kickoff, gameweek = _fixture_cutoff(fixture_row)
        season = str(fixture_row["source_season"])
        home_team_id = int(fixture_row["home_team"])
        away_team_id = int(fixture_row["away_team"])
        context_key = (
            state.signature,
            match_id,
            *self._cutoff_cache_key(kickoff, gameweek),
        )
        cached = self._fixture_lineup_context_cache.get(context_key)
        if cached is not None:
            return deepcopy(cached)

        payload = {
            "match": baseline_fixture,
            "home": self.projected_lineup(
                season=season,
                team_id=home_team_id,
                cutoff_kickoff=kickoff,
                cutoff_gameweek=gameweek,
                refresh=False,
            ),
            "away": self.projected_lineup(
                season=season,
                team_id=away_team_id,
                cutoff_kickoff=kickoff,
                cutoff_gameweek=gameweek,
                refresh=False,
            ),
        }
        self._fixture_lineup_context_cache[context_key] = payload
        return deepcopy(payload)

    def _player_form_metrics(
        self,
        state: RuntimeState,
        *,
        season: str,
        team_id: int,
        player_id: int,
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
    ) -> dict[str, float]:
        metrics_key = (
            state.signature,
            season,
            team_id,
            player_id,
            *self._cutoff_cache_key(cutoff_kickoff, cutoff_gameweek),
        )
        cached = self._player_form_metrics_cache.get(metrics_key)
        if cached is not None:
            return cached.copy()

        rows = state.player_matches.loc[
            (state.player_matches["source_season"] == season)
            & (state.player_matches["team_code"] == team_id)
            & (state.player_matches["player_id"] == player_id)
        ].copy()
        if rows.empty:
            payload = {"matches": 0.0}
            self._player_form_metrics_cache[metrics_key] = payload
            return payload.copy()

        rows = rows.loc[
            rows.apply(
                lambda row: _row_before_fixture(
                    row,
                    season=season,
                    cutoff_kickoff=cutoff_kickoff,
                    cutoff_gameweek=cutoff_gameweek,
                ),
                axis=1,
            )
        ].copy()
        if rows.empty:
            payload = {"matches": 0.0}
            self._player_form_metrics_cache[metrics_key] = payload
            return payload.copy()

        rows = rows.sort_values(
            ["kickoff_time", "match_source_gameweek", "match_id"],
            ascending=[False, False, False],
            kind="stable",
            na_position="last",
        ).head(5)

        total_minutes = float(rows["minutes_played"].fillna(0).sum())
        total_minutes = max(total_minutes, 1.0)
        defensive_total = (
            rows["tackles"].fillna(0)
            + rows["interceptions"].fillna(0)
            + rows["recoveries"].fillna(0)
            + rows["clearances"].fillna(0)
            + rows["blocks"].fillna(0)
        ).sum()
        payload = {
            "matches": float(len(rows)),
            "xg_p90": float(rows["xg"].fillna(0).sum()) * 90.0 / total_minutes,
            "shots_on_target_p90": float(rows["shots_on_target"].fillna(0).sum()) * 90.0 / total_minutes,
            "chances_created_p90": float(rows["chances_created"].fillna(0).sum()) * 90.0 / total_minutes,
            "touches_box_p90": float(rows["touches_opposition_box"].fillna(0).sum()) * 90.0 / total_minutes,
            "tackles_won_p90": float(rows["tackles_won"].fillna(0).sum()) * 90.0 / total_minutes,
            "defensive_actions_p90": float(defensive_total) * 90.0 / total_minutes,
        }
        self._player_form_metrics_cache[metrics_key] = payload
        return payload.copy()

    def _lineup_metrics(
        self,
        state: RuntimeState,
        *,
        season: str,
        team_id: int,
        player_ids: list[int],
        cutoff_kickoff: pd.Timestamp | None,
        cutoff_gameweek: int | None,
    ) -> dict[str, float]:
        metrics_key = (
            state.signature,
            season,
            team_id,
            tuple(player_ids),
            *self._cutoff_cache_key(cutoff_kickoff, cutoff_gameweek),
        )
        cached = self._lineup_metrics_cache.get(metrics_key)
        if cached is not None:
            return cached.copy()

        totals = {
            "attack_strength": 0.0,
            "finishing_strength": 0.0,
            "creation_strength": 0.0,
            "touch_strength": 0.0,
            "tackle_strength": 0.0,
            "defensive_strength": 0.0,
            "known_players": 0.0,
        }
        for player_id in player_ids:
            metrics = self._player_form_metrics(
                state,
                season=season,
                team_id=team_id,
                player_id=player_id,
                cutoff_kickoff=cutoff_kickoff,
                cutoff_gameweek=cutoff_gameweek,
            )
            if metrics.get("matches", 0.0) > 0:
                totals["known_players"] += 1.0
            totals["attack_strength"] += metrics.get("xg_p90", 0.0)
            totals["finishing_strength"] += metrics.get("shots_on_target_p90", 0.0)
            totals["creation_strength"] += metrics.get("chances_created_p90", 0.0)
            totals["touch_strength"] += metrics.get("touches_box_p90", 0.0)
            totals["tackle_strength"] += metrics.get("tackles_won_p90", 0.0)
            totals["defensive_strength"] += metrics.get("defensive_actions_p90", 0.0)
        self._lineup_metrics_cache[metrics_key] = totals
        return totals.copy()

    def _scaled_feature(
        self,
        base_value: Any,
        *,
        baseline_strength: float,
        simulated_strength: float,
        inverse: bool = False,
    ) -> float:
        if pd.isna(base_value):
            return float("nan")
        if baseline_strength <= 0 or simulated_strength <= 0:
            return float(base_value)
        ratio = _clip_ratio(simulated_strength / baseline_strength)
        if inverse:
            ratio = 1.0 / ratio
        return float(base_value) * ratio

    def simulate_fixture(
        self,
        match_id: str,
        *,
        home_player_ids: list[int] | None = None,
        away_player_ids: list[int] | None = None,
        refresh: bool = False,
    ) -> dict[str, Any]:
        state, fixture_row, baseline_fixture = self._baseline_fixture(match_id, refresh=refresh)
        kickoff, gameweek = _fixture_cutoff(fixture_row)
        season = str(fixture_row["source_season"])
        home_team_id = int(fixture_row["home_team"])
        away_team_id = int(fixture_row["away_team"])

        home_context = self.projected_lineup(
            season=season,
            team_id=home_team_id,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )
        away_context = self.projected_lineup(
            season=season,
            team_id=away_team_id,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )

        default_home_ids = [item["playerId"] for item in home_context["lineup"]]
        default_away_ids = [item["playerId"] for item in away_context["lineup"]]
        selected_home_ids = home_player_ids or default_home_ids
        selected_away_ids = away_player_ids or default_away_ids

        baseline_home = self._lineup_metrics(
            state,
            season=season,
            team_id=home_team_id,
            player_ids=default_home_ids,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )
        baseline_away = self._lineup_metrics(
            state,
            season=season,
            team_id=away_team_id,
            player_ids=default_away_ids,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )
        simulated_home = self._lineup_metrics(
            state,
            season=season,
            team_id=home_team_id,
            player_ids=selected_home_ids,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )
        simulated_away = self._lineup_metrics(
            state,
            season=season,
            team_id=away_team_id,
            player_ids=selected_away_ids,
            cutoff_kickoff=kickoff,
            cutoff_gameweek=gameweek,
        )

        adjusted = fixture_row.copy()
        adjusted["home_last5_avg_xg"] = self._scaled_feature(
            fixture_row.get("home_last5_avg_xg"),
            baseline_strength=baseline_home["attack_strength"],
            simulated_strength=simulated_home["attack_strength"],
        )
        adjusted["away_last5_avg_xg"] = self._scaled_feature(
            fixture_row.get("away_last5_avg_xg"),
            baseline_strength=baseline_away["attack_strength"],
            simulated_strength=simulated_away["attack_strength"],
        )
        adjusted["home_last5_avg_shots_on_target"] = self._scaled_feature(
            fixture_row.get("home_last5_avg_shots_on_target"),
            baseline_strength=baseline_home["finishing_strength"],
            simulated_strength=simulated_home["finishing_strength"],
        )
        adjusted["away_last5_avg_shots_on_target"] = self._scaled_feature(
            fixture_row.get("away_last5_avg_shots_on_target"),
            baseline_strength=baseline_away["finishing_strength"],
            simulated_strength=simulated_away["finishing_strength"],
        )
        adjusted["home_last5_avg_big_chances"] = self._scaled_feature(
            fixture_row.get("home_last5_avg_big_chances"),
            baseline_strength=baseline_home["creation_strength"] + baseline_home["touch_strength"],
            simulated_strength=simulated_home["creation_strength"] + simulated_home["touch_strength"],
        )
        adjusted["away_last5_avg_big_chances"] = self._scaled_feature(
            fixture_row.get("away_last5_avg_big_chances"),
            baseline_strength=baseline_away["creation_strength"] + baseline_away["touch_strength"],
            simulated_strength=simulated_away["creation_strength"] + simulated_away["touch_strength"],
        )
        adjusted["home_last5_avg_tackles_won"] = self._scaled_feature(
            fixture_row.get("home_last5_avg_tackles_won"),
            baseline_strength=baseline_home["tackle_strength"],
            simulated_strength=simulated_home["tackle_strength"],
        )
        adjusted["away_last5_avg_tackles_won"] = self._scaled_feature(
            fixture_row.get("away_last5_avg_tackles_won"),
            baseline_strength=baseline_away["tackle_strength"],
            simulated_strength=simulated_away["tackle_strength"],
        )
        adjusted["home_last5_avg_xga"] = self._scaled_feature(
            fixture_row.get("home_last5_avg_xga"),
            baseline_strength=baseline_home["defensive_strength"],
            simulated_strength=simulated_home["defensive_strength"],
            inverse=True,
        )
        adjusted["away_last5_avg_xga"] = self._scaled_feature(
            fixture_row.get("away_last5_avg_xga"),
            baseline_strength=baseline_away["defensive_strength"],
            simulated_strength=simulated_away["defensive_strength"],
            inverse=True,
        )

        adjusted_frame = add_derived_features(pd.DataFrame([adjusted]))
        probabilities = state.model.predict_proba(adjusted_frame.loc[:, FEATURE_COLUMNS])
        probabilities = apply_temperature(probabilities, state.temperature)
        simulated_fixture = serialize_prediction_fixture(
            adjusted.to_dict(),
            probabilities[0],
            state.team_lookup,
        )
        simulated_fixture["status"] = "simulated"

        return {
            "generatedAtUtc": datetime.now(UTC).isoformat(),
            "simulationMode": "lineup-adjusted-team-features",
            "match": baseline_fixture,
            "simulatedMatch": simulated_fixture,
            "home": {
                **home_context,
                "selectedPlayerIds": selected_home_ids,
                "defaultPlayerIds": default_home_ids,
            },
            "away": {
                **away_context,
                "selectedPlayerIds": selected_away_ids,
                "defaultPlayerIds": default_away_ids,
            },
            "adjustments": {
                "homeAttackRatio": coerce_float(
                    simulated_home["attack_strength"] / baseline_home["attack_strength"]
                    if baseline_home["attack_strength"] > 0
                    else None,
                    3,
                ),
                "awayAttackRatio": coerce_float(
                    simulated_away["attack_strength"] / baseline_away["attack_strength"]
                    if baseline_away["attack_strength"] > 0
                    else None,
                    3,
                ),
                "homeDefenceRatio": coerce_float(
                    simulated_home["defensive_strength"] / baseline_home["defensive_strength"]
                    if baseline_home["defensive_strength"] > 0
                    else None,
                    3,
                ),
                "awayDefenceRatio": coerce_float(
                    simulated_away["defensive_strength"] / baseline_away["defensive_strength"]
                    if baseline_away["defensive_strength"] > 0
                    else None,
                    3,
                ),
            },
        }
