from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

DEFAULT_ELO = 1500.0
DEFAULT_ELO_K = 20.0
DEFAULT_ELO_HOME_ADVANTAGE = 80.0
PI_LAMBDA = 0.035
PI_GAMMA = 0.7
PI_BASE = 10.0
PI_SCALE = 3.0


def expected_score(rating_difference: float) -> float:
    return 1.0 / (1.0 + 10.0 ** (-rating_difference / 400.0))


def match_score(home_goals: float, away_goals: float) -> float:
    if home_goals > away_goals:
        return 1.0
    if home_goals < away_goals:
        return 0.0
    return 0.5


def expected_goal_difference(rating: float) -> float:
    magnitude = (PI_BASE ** (abs(rating) / PI_SCALE)) - 1.0
    return magnitude if rating >= 0 else -magnitude


@dataclass
class EloRatings:
    ratings: dict[Any, float] = field(default_factory=dict)
    k_factor: float = DEFAULT_ELO_K
    home_advantage: float = DEFAULT_ELO_HOME_ADVANTAGE
    initial_rating: float = DEFAULT_ELO

    def get(self, team_key: Any) -> float:
        return self.ratings.get(team_key, self.initial_rating)

    def snapshot(self, home_key: Any, away_key: Any) -> tuple[float, float]:
        return self.get(home_key), self.get(away_key)

    def update(self, home_key: Any, away_key: Any, home_goals: float, away_goals: float) -> None:
        home_rating, away_rating = self.snapshot(home_key, away_key)
        expected_home = expected_score((home_rating + self.home_advantage) - away_rating)
        observed_home = match_score(home_goals, away_goals)
        self.ratings[home_key] = home_rating + self.k_factor * (observed_home - expected_home)
        self.ratings[away_key] = away_rating + self.k_factor * ((1.0 - observed_home) - (1.0 - expected_home))


@dataclass
class TeamPiRating:
    home: float = 0.0
    away: float = 0.0


@dataclass
class PiRatings:
    ratings: dict[Any, TeamPiRating] = field(default_factory=dict)
    learning_rate: float = PI_LAMBDA
    cross_context: float = PI_GAMMA

    def get(self, team_key: Any) -> TeamPiRating:
        stored = self.ratings.get(team_key)
        if stored is None:
            return TeamPiRating()
        return stored

    def snapshot(self, home_key: Any, away_key: Any) -> tuple[float, float, float, float]:
        home = self.get(home_key)
        away = self.get(away_key)
        return home.home, home.away, away.home, away.away

    def update(self, home_key: Any, away_key: Any, home_goals: float, away_goals: float) -> None:
        home = self.ratings.setdefault(home_key, TeamPiRating())
        away = self.ratings.setdefault(away_key, TeamPiRating())
        predicted = expected_goal_difference(home.home) - expected_goal_difference(away.away)
        observed = home_goals - away_goals
        weighted_error = PI_SCALE * math.log10(1.0 + abs(observed - predicted))
        if predicted < observed:
            home_error, away_error = weighted_error, -weighted_error
        else:
            home_error, away_error = -weighted_error, weighted_error
        home.home += home_error * self.learning_rate
        home.away += home_error * self.learning_rate * self.cross_context
        away.away += away_error * self.learning_rate
        away.home += away_error * self.learning_rate * self.cross_context
