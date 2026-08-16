from fpl_predictor.ratings import EloRatings, PiRatings, expected_goal_difference


def test_elo_snapshot_is_pre_match_and_winner_gains_rating() -> None:
    elo = EloRatings()
    before_home, before_away = elo.snapshot("arsenal", "chelsea")

    elo.update("arsenal", "chelsea", 2, 0)
    after_home, after_away = elo.snapshot("arsenal", "chelsea")

    assert before_home == 1500
    assert before_away == 1500
    assert after_home > before_home
    assert after_away < before_away


def test_pi_ratings_use_pre_match_home_and_away_context() -> None:
    ratings = PiRatings()
    home_home, home_away, away_home, away_away = ratings.snapshot("arsenal", "chelsea")
    assert (home_home, home_away, away_home, away_away) == (0.0, 0.0, 0.0, 0.0)

    ratings.update("arsenal", "chelsea", 3, 0)
    home_home, home_away, away_home, away_away = ratings.snapshot("arsenal", "chelsea")

    assert home_home > 0
    assert home_away > 0
    assert home_home > home_away
    assert away_away < 0
    assert expected_goal_difference(home_home) > 0
