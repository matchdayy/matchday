from app.models import MatchEventType, Player
from app.services.player_stats import PlayerStats, rank_players, stats_by_player
from tests.builders import card, goal, make_player

scorer = make_player(player_id=1, team_id=1)
assistant = make_player(player_id=2, team_id=1)
defender = make_player(player_id=3, team_id=2)


def test_goal_and_assist():
    stats = stats_by_player(events=[goal(player=scorer, assist=assistant)])

    assert stats[scorer.id] == PlayerStats(goals=1)
    assert stats[assistant.id] == PlayerStats(assists=1)


def test_own_goal_is_not_counted_for_scorer():
    stats = stats_by_player(events=[goal(player=defender, own_goal=True)])

    assert stats.get(defender.id, PlayerStats()).goals == 0


def test_cards():
    stats = stats_by_player(
        events=[
            card(player=defender, event_type=MatchEventType.YELLOW_CARD),
            card(player=defender, event_type=MatchEventType.YELLOW_CARD),
            card(player=defender, event_type=MatchEventType.RED_CARD),
        ]
    )

    assert stats[defender.id] == PlayerStats(yellow_cards=2, red_cards=1)


def test_player_without_events_is_absent():
    stats = stats_by_player(events=[goal(player=scorer)])

    assert defender.id not in stats


def test_rank_players_sorts_by_total_then_name_and_skips_zeros():
    players = {
        1: Player(id=1, full_name="Борис"),
        2: Player(id=2, full_name="Антон"),
        3: Player(id=3, full_name="Виктор"),
        4: Player(id=4, full_name="Глеб"),
    }

    ranked = rank_players(totals={1: 2, 2: 2, 3: 5, 4: 0}, players=players)

    assert [(row.player.full_name, row.total) for row in ranked] == [
        ("Виктор", 5),
        ("Антон", 2),
        ("Борис", 2),
    ]
