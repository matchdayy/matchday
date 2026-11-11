from app.models import MatchEventType, MatchStatus
from app.services.fantasy.rules import PointsReason
from app.services.fantasy.scoring import (
    PastLineup,
    PointsLine,
    RoundEvent,
    RoundMatch,
    TeamLineup,
    can_close_round,
    resolve_lineups,
    score_round,
)

HOME_TEAM_ID = 1
AWAY_TEAM_ID = 2
OTHER_TEAM_ID = 3
FANTASY_TEAM_ID = 100

HOME_FORWARD = 11
HOME_MIDFIELDER = 12
AWAY_DEFENDER = 21
OTHER_PLAYER = 31

PLAYER_TEAMS = {
    HOME_FORWARD: HOME_TEAM_ID,
    HOME_MIDFIELDER: HOME_TEAM_ID,
    AWAY_DEFENDER: AWAY_TEAM_ID,
    OTHER_PLAYER: OTHER_TEAM_ID,
}


def make_event(
    *,
    event_id: int,
    player_id: int,
    event_type: MatchEventType = MatchEventType.GOAL,
    minute: int = 10,
    assist_player_id: int | None = None,
    is_own_goal: bool = False,
) -> RoundEvent:
    return RoundEvent(
        id=event_id,
        type=event_type,
        minute=minute,
        player_id=player_id,
        player_team_id=PLAYER_TEAMS[player_id],
        assist_player_id=assist_player_id,
        is_own_goal=is_own_goal,
    )


def make_match(
    *,
    events: list[RoundEvent],
    match_id: int = 1,
    status: MatchStatus = MatchStatus.FINISHED,
) -> RoundMatch:
    return RoundMatch(
        id=match_id,
        status=status,
        home_team_id=HOME_TEAM_ID,
        away_team_id=AWAY_TEAM_ID,
        events=tuple(events),
    )


def make_lineup(
    *, player_ids: list[int], fantasy_team_id: int = FANTASY_TEAM_ID
) -> TeamLineup:
    return TeamLineup(
        fantasy_team_id=fantasy_team_id,
        player_ids=tuple(player_ids),
        player_team_ids={
            player_id: PLAYER_TEAMS[player_id] for player_id in player_ids
        },
    )


def event_line(
    *, player_id: int, reason: PointsReason, points: int, event_id: int = 1
) -> PointsLine:
    return PointsLine(
        fantasy_team_id=FANTASY_TEAM_ID,
        player_id=player_id,
        match_id=1,
        event_id=event_id,
        minute=10,
        reason=reason,
        points=points,
    )


def played_line(*, player_id: int, match_id: int = 1) -> PointsLine:
    return PointsLine(
        fantasy_team_id=FANTASY_TEAM_ID,
        player_id=player_id,
        match_id=match_id,
        event_id=None,
        minute=None,
        reason=PointsReason.PLAYED,
        points=1,
    )


def test_goal_gives_four_points_to_scorer():
    match = make_match(events=[make_event(event_id=1, player_id=HOME_FORWARD)])

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[HOME_FORWARD])]
    )

    assert lines == [
        event_line(player_id=HOME_FORWARD, reason=PointsReason.GOAL, points=4),
        played_line(player_id=HOME_FORWARD),
    ]


def test_assist_gives_three_points_to_assistant():
    match = make_match(
        events=[
            make_event(
                event_id=1, player_id=HOME_FORWARD, assist_player_id=HOME_MIDFIELDER
            )
        ]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[HOME_MIDFIELDER])]
    )

    assert lines == [
        event_line(player_id=HOME_MIDFIELDER, reason=PointsReason.ASSIST, points=3),
        played_line(player_id=HOME_MIDFIELDER),
    ]


def test_own_goal_takes_two_points_from_scorer():
    match = make_match(
        events=[make_event(event_id=1, player_id=AWAY_DEFENDER, is_own_goal=True)]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[AWAY_DEFENDER])]
    )

    assert lines == [
        event_line(player_id=AWAY_DEFENDER, reason=PointsReason.OWN_GOAL, points=-2),
        played_line(player_id=AWAY_DEFENDER),
    ]


def test_yellow_card_takes_one_point():
    match = make_match(
        events=[
            make_event(
                event_id=1,
                player_id=AWAY_DEFENDER,
                event_type=MatchEventType.YELLOW_CARD,
            )
        ]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[AWAY_DEFENDER])]
    )

    assert lines[0] == event_line(
        player_id=AWAY_DEFENDER, reason=PointsReason.YELLOW_CARD, points=-1
    )


def test_red_card_takes_three_points():
    match = make_match(
        events=[
            make_event(
                event_id=1, player_id=AWAY_DEFENDER, event_type=MatchEventType.RED_CARD
            )
        ]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[AWAY_DEFENDER])]
    )

    assert lines[0] == event_line(
        player_id=AWAY_DEFENDER, reason=PointsReason.RED_CARD, points=-3
    )


def test_played_point_for_each_finished_match_of_player_team():
    matches = [make_match(events=[], match_id=1), make_match(events=[], match_id=2)]

    lines = score_round(
        matches=matches, lineups=[make_lineup(player_ids=[HOME_FORWARD])]
    )

    assert lines == [
        played_line(player_id=HOME_FORWARD, match_id=1),
        played_line(player_id=HOME_FORWARD, match_id=2),
    ]


def test_no_played_point_when_player_team_did_not_play():
    match = make_match(events=[])

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[OTHER_PLAYER])]
    )

    assert lines == []


def test_events_of_players_outside_lineup_give_nothing():
    match = make_match(
        events=[
            make_event(
                event_id=1, player_id=HOME_FORWARD, assist_player_id=HOME_MIDFIELDER
            )
        ]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[AWAY_DEFENDER])]
    )

    assert lines == [played_line(player_id=AWAY_DEFENDER)]


def test_cancelled_match_gives_no_played_point():
    match = make_match(events=[], status=MatchStatus.CANCELLED)

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[HOME_FORWARD])]
    )

    assert lines == []


def test_unfinished_match_gives_no_points():
    match = make_match(
        events=[make_event(event_id=1, player_id=HOME_FORWARD)],
        status=MatchStatus.LIVE,
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[HOME_FORWARD])]
    )

    assert lines == []


def test_lines_are_ordered_by_minute_then_event():
    match = make_match(
        events=[
            make_event(event_id=7, player_id=HOME_FORWARD, minute=80),
            make_event(event_id=9, player_id=HOME_FORWARD, minute=5),
            make_event(event_id=8, player_id=HOME_FORWARD, minute=5),
        ]
    )

    lines = score_round(
        matches=[match], lineups=[make_lineup(player_ids=[HOME_FORWARD])]
    )

    assert [line.event_id for line in lines] == [8, 9, 7, None]


def test_score_round_is_repeatable():
    match = make_match(
        events=[
            make_event(
                event_id=2, player_id=HOME_FORWARD, assist_player_id=HOME_MIDFIELDER
            ),
            make_event(
                event_id=1, player_id=AWAY_DEFENDER, event_type=MatchEventType.RED_CARD
            ),
        ]
    )
    lineups = [
        make_lineup(player_ids=[HOME_FORWARD, AWAY_DEFENDER], fantasy_team_id=200),
        make_lineup(player_ids=[HOME_MIDFIELDER, HOME_FORWARD], fantasy_team_id=100),
    ]

    first = score_round(matches=[match], lineups=lineups)
    second = score_round(matches=[match], lineups=list(reversed(lineups)))

    assert first == second


def test_round_can_be_closed_when_all_matches_finished_or_cancelled():
    matches = [
        make_match(events=[], match_id=1),
        make_match(events=[], match_id=2, status=MatchStatus.CANCELLED),
    ]

    assert can_close_round(matches) == []


def test_round_cannot_be_closed_with_unfinished_match():
    matches = [
        make_match(events=[], match_id=1),
        make_match(events=[], match_id=2, status=MatchStatus.LIVE),
    ]

    assert can_close_round(matches) == [
        "Матч 2 ещё не завершён и не отменён (статус: live)."
    ]


def test_submitted_lineup_is_used():
    submitted = make_lineup(player_ids=[HOME_FORWARD])
    previous = PastLineup(
        round_number=1, lineup=make_lineup(player_ids=[AWAY_DEFENDER])
    )

    assert resolve_lineups(submitted=[submitted], previous=[previous]) == [submitted]


def test_latest_previous_lineup_is_used_when_nothing_submitted():
    older = PastLineup(round_number=1, lineup=make_lineup(player_ids=[OTHER_PLAYER]))
    latest = PastLineup(round_number=2, lineup=make_lineup(player_ids=[HOME_FORWARD]))

    assert resolve_lineups(submitted=[], previous=[latest, older]) == [latest.lineup]


def test_team_without_any_lineup_is_left_out():
    submitted = make_lineup(player_ids=[HOME_FORWARD], fantasy_team_id=100)

    lineups = resolve_lineups(submitted=[submitted], previous=[])

    assert [lineup.fantasy_team_id for lineup in lineups] == [100]
