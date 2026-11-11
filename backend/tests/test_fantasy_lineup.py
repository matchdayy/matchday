from datetime import UTC, datetime, timedelta

from app.services.fantasy.lineup import (
    LineupCandidate,
    LineupCheck,
    LineupErrorKind,
    validate_lineup,
)

DEADLINE = datetime(2026, 11, 20, 18, 0, tzinfo=UTC)
BEFORE_DEADLINE = DEADLINE - timedelta(hours=1)


def make_candidate(
    *, player_id: int, team_id: int, price: int = 10, in_tournament: bool = True
) -> LineupCandidate:
    return LineupCandidate(
        id=player_id,
        full_name=f"Игрок {player_id}",
        team_id=team_id,
        team_name=f"Команда {team_id}",
        price=price,
        in_tournament=in_tournament,
    )


# Пять игроков из трёх команд, по 10 — ровно в бюджет и в лимит на команду.
VALID_SQUAD = {
    1: make_candidate(player_id=1, team_id=1),
    2: make_candidate(player_id=2, team_id=1),
    3: make_candidate(player_id=3, team_id=2),
    4: make_candidate(player_id=4, team_id=2),
    5: make_candidate(player_id=5, team_id=3),
}


def check(
    *, player_ids: list[int], candidates: dict[int, LineupCandidate]
) -> LineupCheck:
    return validate_lineup(
        player_ids=player_ids,
        candidates=candidates,
        now=BEFORE_DEADLINE,
        deadline=DEADLINE,
    )


def test_valid_lineup_passes():
    result = check(player_ids=[1, 2, 3, 4, 5], candidates=VALID_SQUAD)

    assert result == LineupCheck(kind=None, errors=(), total_price=50)


def test_deadline_passed_is_separate_kind():
    result = validate_lineup(
        player_ids=[1, 2, 3, 4, 5],
        candidates=VALID_SQUAD,
        now=DEADLINE,
        deadline=DEADLINE,
    )

    assert result.kind == LineupErrorKind.DEADLINE_PASSED
    assert result.errors == (
        "Дедлайн тура прошёл, состав на этот тур больше не меняется.",
    )


def test_deadline_hides_other_errors():
    result = validate_lineup(
        player_ids=[1],
        candidates=VALID_SQUAD,
        now=DEADLINE + timedelta(minutes=1),
        deadline=DEADLINE,
    )

    assert len(result.errors) == 1


def test_wrong_number_of_players():
    result = check(player_ids=[1, 2, 3, 4], candidates=VALID_SQUAD)

    assert result.kind == LineupErrorKind.INVALID_LINEUP
    assert result.errors == ("В составе должно быть 5 игроков, а выбрано 4.",)


def test_duplicate_player():
    result = check(player_ids=[1, 2, 3, 4, 4], candidates=VALID_SQUAD)

    assert result.errors == ("Игрок 4 выбран в состав несколько раз.",)


def test_player_not_in_tournament():
    candidates = {
        **VALID_SQUAD,
        5: make_candidate(player_id=5, team_id=3, in_tournament=False),
    }

    result = check(player_ids=[1, 2, 3, 4, 5], candidates=candidates)

    assert result.errors == ("Игрок 5 не играет в этом турнире.",)


def test_unknown_player_is_not_in_tournament():
    result = check(player_ids=[1, 2, 3, 4, 99], candidates=VALID_SQUAD)

    assert result.errors == ("Игрок с id 99 не играет в этом турнире.",)


def test_budget_exceeded():
    candidates = {**VALID_SQUAD, 5: make_candidate(player_id=5, team_id=3, price=13)}

    result = check(player_ids=[1, 2, 3, 4, 5], candidates=candidates)

    assert result.errors == ("Состав стоит 53, а бюджет 50.",)


def test_too_many_players_from_one_team():
    candidates = {**VALID_SQUAD, 3: make_candidate(player_id=3, team_id=1)}

    result = check(player_ids=[1, 2, 3, 4, 5], candidates=candidates)

    assert result.errors == (
        "Из команды «Команда 1» (id 1) выбрано 3 игрока, а можно не больше 2.",
    )


def test_all_lineup_errors_are_reported_together():
    candidates = {**VALID_SQUAD, 3: make_candidate(player_id=3, team_id=1, price=31)}

    result = check(player_ids=[1, 2, 3, 99], candidates=candidates)

    assert result.errors == (
        "В составе должно быть 5 игроков, а выбрано 4.",
        "Игрок с id 99 не играет в этом турнире.",
        "Состав стоит 51, а бюджет 50.",
        "Из команды «Команда 1» (id 1) выбрано 3 игрока, а можно не больше 2.",
    )
