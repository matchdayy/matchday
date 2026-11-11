from app.services.fantasy.rating import RatingEntry, RatingRow, build_rating

FIRST_ROUND = 1
LAST_ROUND = 2


def entry(*, team_id: int, round_id: int, points: int) -> RatingEntry:
    return RatingEntry(fantasy_team_id=team_id, round_id=round_id, points=points)


def test_rating_sums_points_and_last_round():
    entries = [
        entry(team_id=1, round_id=FIRST_ROUND, points=5),
        entry(team_id=1, round_id=LAST_ROUND, points=4),
        entry(team_id=1, round_id=LAST_ROUND, points=-1),
    ]

    rating = build_rating(team_ids=[1], entries=entries, last_round_id=LAST_ROUND)

    assert rating == [
        RatingRow(position=1, fantasy_team_id=1, points=8, last_round_points=3)
    ]


def test_more_points_ranks_higher():
    entries = [
        entry(team_id=1, round_id=LAST_ROUND, points=3),
        entry(team_id=2, round_id=LAST_ROUND, points=7),
    ]

    rating = build_rating(team_ids=[1, 2], entries=entries, last_round_id=LAST_ROUND)

    assert [row.fantasy_team_id for row in rating] == [2, 1]


def test_tie_broken_by_last_round_points():
    entries = [
        entry(team_id=1, round_id=FIRST_ROUND, points=6),
        entry(team_id=1, round_id=LAST_ROUND, points=2),
        entry(team_id=2, round_id=FIRST_ROUND, points=3),
        entry(team_id=2, round_id=LAST_ROUND, points=5),
    ]

    rating = build_rating(team_ids=[1, 2], entries=entries, last_round_id=LAST_ROUND)

    assert [row.fantasy_team_id for row in rating] == [2, 1]


def test_full_tie_broken_by_smaller_team_id_with_distinct_positions():
    entries = [
        entry(team_id=5, round_id=LAST_ROUND, points=4),
        entry(team_id=3, round_id=LAST_ROUND, points=4),
    ]

    rating = build_rating(team_ids=[5, 3], entries=entries, last_round_id=LAST_ROUND)

    assert [(row.position, row.fantasy_team_id) for row in rating] == [(1, 3), (2, 5)]


def test_team_without_points_is_in_rating_with_zeros():
    rating = build_rating(team_ids=[1], entries=[], last_round_id=None)

    assert rating == [
        RatingRow(position=1, fantasy_team_id=1, points=0, last_round_points=0)
    ]


def test_entries_of_teams_outside_league_are_ignored():
    entries = [entry(team_id=9, round_id=LAST_ROUND, points=10)]

    rating = build_rating(team_ids=[1], entries=entries, last_round_id=LAST_ROUND)

    assert [row.fantasy_team_id for row in rating] == [1]
