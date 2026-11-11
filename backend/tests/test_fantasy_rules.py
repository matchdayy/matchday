from app.services.fantasy.rules import POINTS, PointsReason, rules_as_dict


def test_rules_as_dict_matches_api_contract():
    assert rules_as_dict() == {
        "squad_size": 5,
        "budget": 50,
        "max_per_team": 2,
        "points": {
            "goal": 4,
            "assist": 3,
            "played": 1,
            "yellow_card": -1,
            "red_card": -3,
            "own_goal": -2,
        },
    }


def test_every_points_reason_has_points():
    assert set(POINTS) == set(PointsReason)
