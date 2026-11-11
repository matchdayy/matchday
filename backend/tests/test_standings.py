from app.models import MatchStatus, Team
from app.services.standings import build_table
from tests.builders import finished_match, goal, make_match, make_player

alpha = Team(id=1, name="Альфа")
beta = Team(id=2, name="Бета")
gamma = Team(id=3, name="Гамма")


def test_win_gives_three_points_and_loss_zero():
    match = finished_match(home_team_id=1, away_team_id=2, home_goals=2, away_goals=1)

    table = build_table(teams=[alpha, beta], matches=[match])

    winner, loser = table
    assert winner.team is alpha
    assert (winner.played, winner.won, winner.points) == (1, 1, 3)
    assert (winner.goals_for, winner.goals_against, winner.goal_diff) == (2, 1, 1)
    assert loser.team is beta
    assert (loser.played, loser.lost, loser.points) == (1, 1, 0)
    assert loser.goal_diff == -1


def test_draw_gives_one_point_each():
    match = finished_match(home_team_id=1, away_team_id=2, home_goals=1, away_goals=1)

    table = build_table(teams=[alpha, beta], matches=[match])

    assert [row.drawn for row in table] == [1, 1]
    assert [row.points for row in table] == [1, 1]


def test_team_without_matches_has_zeros():
    table = build_table(teams=[alpha], matches=[])

    row = table[0]
    assert row.position == 1
    assert (row.played, row.points, row.goals_for, row.goal_diff) == (0, 0, 0, 0)


def test_only_finished_matches_count():
    alpha_player = make_player(player_id=10, team_id=1)
    live = make_match(events=[goal(player=alpha_player)], status=MatchStatus.LIVE)
    scheduled = make_match(events=[], status=MatchStatus.SCHEDULED)
    cancelled = make_match(
        events=[goal(player=alpha_player)], status=MatchStatus.CANCELLED
    )
    # Статус «пауза» добавляется в MatchStatus задачей #28, поэтому здесь строка.
    paused = make_match(events=[goal(player=alpha_player)], status="paused")

    table = build_table(
        teams=[alpha, beta], matches=[live, scheduled, cancelled, paused]
    )

    assert [row.played for row in table] == [0, 0]


def test_equal_points_sorted_by_goal_difference():
    # Альфа и Бета обе по 3 очка, между собой не играли. У Беты разница +3, у Альфы +1.
    matches = [
        finished_match(home_team_id=1, away_team_id=3, home_goals=1, away_goals=0),
        finished_match(home_team_id=3, away_team_id=2, home_goals=0, away_goals=3),
    ]

    table = build_table(teams=[alpha, beta, gamma], matches=matches)

    assert [row.team.name for row in table] == ["Бета", "Альфа", "Гамма"]
    assert [row.position for row in table] == [1, 2, 3]


def test_head_to_head_beats_goal_difference():
    # У Альфы и Беты по 3 очка. У Беты разница лучше (+4 против +1),
    # но личную встречу выиграла Альфа — она выше.
    matches = [
        finished_match(home_team_id=1, away_team_id=2, home_goals=1, away_goals=0),
        finished_match(home_team_id=2, away_team_id=3, home_goals=5, away_goals=0),
    ]

    table = build_table(teams=[alpha, beta, gamma], matches=matches)

    assert [row.team.name for row in table] == ["Альфа", "Бета", "Гамма"]
    assert [row.points for row in table] == [3, 3, 0]
    assert [row.goal_diff for row in table] == [1, 4, -5]


def test_everything_equal_sorted_by_name():
    table = build_table(teams=[gamma, beta, alpha], matches=[])

    assert [row.team.name for row in table] == ["Альфа", "Бета", "Гамма"]
