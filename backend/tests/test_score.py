from app.models import MatchEventType, MatchStatus
from app.services.score import Score, displayed_score, match_score
from tests.builders import (
    AWAY_TEAM_ID,
    HOME_TEAM_ID,
    card,
    goal,
    make_match,
    make_player,
)

home_player = make_player(player_id=1, team_id=HOME_TEAM_ID)
away_player = make_player(player_id=2, team_id=AWAY_TEAM_ID)


def test_match_without_goals_is_nil_nil():
    match = make_match(events=[])

    assert match_score(match=match) == Score(home=0, away=0)


def test_goal_counts_for_scorer_team():
    match = make_match(events=[goal(player=away_player)])

    assert match_score(match=match) == Score(home=0, away=1)


def test_own_goal_counts_for_opponent():
    match = make_match(events=[goal(player=home_player, own_goal=True)])

    assert match_score(match=match) == Score(home=0, away=1)


def test_cards_do_not_change_score():
    match = make_match(
        events=[card(player=home_player, event_type=MatchEventType.YELLOW_CARD)]
    )

    assert match_score(match=match) == Score(home=0, away=0)


def test_mixed_events():
    match = make_match(
        events=[
            goal(player=home_player),
            card(player=away_player, event_type=MatchEventType.RED_CARD),
            goal(player=away_player, own_goal=True),
            goal(player=away_player),
            goal(player=home_player),
        ]
    )

    assert match_score(match=match) == Score(home=3, away=1)


def test_scheduled_match_has_no_displayed_score():
    match = make_match(events=[], status=MatchStatus.SCHEDULED)

    assert displayed_score(match=match) is None


def test_cancelled_match_has_no_displayed_score():
    match = make_match(events=[goal(player=home_player)], status=MatchStatus.CANCELLED)

    assert displayed_score(match=match) is None


def test_paused_match_shows_current_score():
    # Статус «пауза» добавляется в MatchStatus задачей #28. Строка проверяет,
    # что счёт у такого матча показывается и до, и после этого изменения.
    match = make_match(events=[goal(player=home_player)], status="paused")

    assert displayed_score(match=match) == Score(home=1, away=0)


def test_live_match_shows_current_score():
    match = make_match(events=[goal(player=home_player)], status=MatchStatus.LIVE)

    assert displayed_score(match=match) == Score(home=1, away=0)
