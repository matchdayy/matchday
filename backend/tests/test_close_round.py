"""Закрытие тура: POST /api/rounds/{id}/close и GET /api/fantasy/rules.

База настоящая, как в остальных тестах ручек. Фикстура fantasy_season
кладёт в базу турнир с турами, матчами, событиями и составами и
удаляет его после теста.
"""

import asyncio
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import delete, select, update

from app import models
from app.auth import create_access_token
from app.config import settings
from app.models import MatchEventType, MatchStatus, UserRole
from app.services.fantasy.close_round import close_round
from app.services.tournament_status import today_utc
from tests.conftest import _delete_tournament, session_maker

TEST_SECRET = "test-secret-only-for-pytest-0123456789"
MISSING_ID = 999_999_999


@pytest.fixture(autouse=True)
def secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Свой ключ, чтобы тесты не зависели от APP_SECRET_KEY на машине."""
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET)


def bearer(user: models.User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user_id=user.id)}"}


@dataclass
class FantasySeason:
    """Турнир для фэнтези, который положила в базу фикстура fantasy_season."""

    tournament: models.Tournament
    rounds: dict[int, models.Round] = field(default_factory=dict)
    """Туры по номеру."""
    players: dict[str, models.Player] = field(default_factory=dict)
    """Игроки по фамилии."""
    matches: dict[str, models.Match] = field(default_factory=dict)
    """Матчи по короткому имени: «альфа-бета», «альфа-гамма» и так далее."""
    events: dict[str, models.MatchEvent] = field(default_factory=dict)
    """События по короткому имени: «гол Орлова» и так далее."""
    fantasy_teams: dict[str, models.FantasyTeam] = field(default_factory=dict)
    """Фэнтези-команды: «первая» и «вторая»."""


@pytest.fixture
def fantasy_season(
    users: dict[UserRole, models.User],
) -> Iterator[FantasySeason]:
    """Турнир из трёх команд и четырёх туров. Удаляется после теста.

    Тур 1: Альфа — Бета 2:1, завершён. Гол Орлова с передачей Белова (10'),
    автогол Зайцева (30'), жёлтая у Белова (40'), гол Котова (60').
    Бета — Гамма отменён.
    Тур 2: Альфа — Гамма, завершён. Гол Лебедева (5'), красная у Орлова (70').
    Тур 3: Бета — Гамма, идёт. Тур 4: матчей нет.

    Первая фэнтези-команда прислала состав только на туры 1 и 3:
    Орлов, Белов, Зайцев на тур 1 и один Зайцев на тур 3.
    Вторая прислала Котова и Лебедева на тур 1, Орлова и Лебедева на тур 2.
    """
    season = asyncio.run(_create_season(users=users))
    yield season
    asyncio.run(_delete_tournament(season.tournament.id))


async def _create_season(*, users: dict[UserRole, models.User]) -> FantasySeason:
    today = today_utc()
    tournament = models.Tournament(
        name="Кубок фэнтези",
        sport="football",
        start_date=today - timedelta(days=14),
        end_date=today + timedelta(days=14),
    )
    season = FantasySeason(tournament=tournament)
    teams = {
        name: models.Team(tournament=tournament, name=name)
        for name in ["Альфа", "Бета", "Гамма"]
    }
    for surname, team in [
        ("Орлов", "Альфа"),
        ("Белов", "Альфа"),
        ("Зайцев", "Бета"),
        ("Котов", "Бета"),
        ("Лебедев", "Гамма"),
    ]:
        season.players[surname] = models.Player(team=teams[team], full_name=surname)
    deadline = datetime.now(tz=UTC) - timedelta(days=7)
    for number in [1, 2, 3, 4]:
        season.rounds[number] = models.Round(
            tournament=tournament,
            number=number,
            title=f"Тур {number}",
            deadline=deadline + timedelta(days=number),
        )
    async with session_maker() as db:
        db.add_all([tournament, *teams.values(), *season.players.values()])
        db.add_all(season.rounds.values())
        _add_matches(season=season, teams=teams)
        db.add_all(season.matches.values())
        _add_fantasy_teams(season=season, users=users)
        db.add_all(season.fantasy_teams.values())
        await db.flush()
        db.add_all(_lineups(season=season))
        await db.commit()
    return season


def _add_matches(*, season: FantasySeason, teams: dict[str, models.Team]) -> None:
    players = season.players

    def match(
        home: str, away: str, round_number: int, status: MatchStatus
    ) -> models.Match:
        return models.Match(
            tournament=season.tournament,
            round=season.rounds[round_number],
            home_team=teams[home],
            away_team=teams[away],
            starts_at=datetime.now(tz=UTC),
            status=status,
        )

    def event(
        event_type: MatchEventType, surname: str, minute: int, **extra: object
    ) -> models.MatchEvent:
        return models.MatchEvent(
            type=event_type, minute=minute, player=players[surname], **extra
        )

    events = season.events
    events["гол Орлова"] = event(
        MatchEventType.GOAL, "Орлов", 10, assist_player=players["Белов"]
    )
    events["автогол Зайцева"] = event(
        MatchEventType.GOAL, "Зайцев", 30, is_own_goal=True
    )
    events["жёлтая Белова"] = event(MatchEventType.YELLOW_CARD, "Белов", 40)
    events["гол Котова"] = event(MatchEventType.GOAL, "Котов", 60)
    events["гол Лебедева"] = event(MatchEventType.GOAL, "Лебедев", 5)
    events["красная Орлова"] = event(MatchEventType.RED_CARD, "Орлов", 70)

    alpha_beta = match("Альфа", "Бета", 1, MatchStatus.FINISHED)
    alpha_beta.events = [
        events[name]
        for name in ["гол Орлова", "автогол Зайцева", "жёлтая Белова", "гол Котова"]
    ]
    alpha_gamma = match("Альфа", "Гамма", 2, MatchStatus.FINISHED)
    alpha_gamma.events = [events["гол Лебедева"], events["красная Орлова"]]
    season.matches = {
        "альфа-бета": alpha_beta,
        "бета-гамма отменён": match("Бета", "Гамма", 1, MatchStatus.CANCELLED),
        "альфа-гамма": alpha_gamma,
        "бета-гамма идёт": match("Бета", "Гамма", 3, MatchStatus.LIVE),
    }


def _add_fantasy_teams(
    *, season: FantasySeason, users: dict[UserRole, models.User]
) -> None:
    for key, owner in [("первая", UserRole.VIEWER), ("вторая", UserRole.OPERATOR)]:
        season.fantasy_teams[key] = models.FantasyTeam(
            user_id=users[owner].id,
            tournament=season.tournament,
            name=f"{key.capitalize()} команда",
        )


def _lineups(*, season: FantasySeason) -> list[models.FantasyLineup]:
    plan = [
        ("первая", 1, ["Орлов", "Белов", "Зайцев"]),
        ("первая", 3, ["Зайцев"]),
        ("вторая", 1, ["Котов", "Лебедев"]),
        ("вторая", 2, ["Орлов", "Лебедев"]),
    ]
    return [
        models.FantasyLineup(
            fantasy_team_id=season.fantasy_teams[team].id,
            round_id=season.rounds[number].id,
            players=[season.players[surname] for surname in surnames],
        )
        for team, number, surnames in plan
    ]


async def _journal(round_id: int) -> list[models.FantasyPointsEntry]:
    async with session_maker() as db:
        entries = await db.scalars(
            select(models.FantasyPointsEntry)
            .where(models.FantasyPointsEntry.round_id == round_id)
            .order_by(models.FantasyPointsEntry.id)
        )
        return list(entries)


def journal(round_id: int) -> list[models.FantasyPointsEntry]:
    return asyncio.run(_journal(round_id))


def journal_rows(round_id: int) -> list[tuple[object, ...]]:
    """Журнал тура целиком, вместе с id строк и временем записи."""
    return [
        (
            entry.id,
            entry.fantasy_team_id,
            entry.player_id,
            entry.match_id,
            entry.event_id,
            entry.minute,
            entry.reason,
            entry.points,
            entry.created_at,
        )
        for entry in journal(round_id)
    ]


def totals(round_id: int) -> dict[int, int]:
    """Сумма очков каждой фэнтези-команды за тур."""
    result: dict[int, int] = {}
    for entry in journal(round_id):
        result[entry.fantasy_team_id] = (
            result.get(entry.fantasy_team_id, 0) + entry.points
        )
    return result


def close(client: TestClient, round_id: int, user: models.User | None) -> Response:
    headers = bearer(user) if user else {}
    return client.post(f"/api/rounds/{round_id}/close", headers=headers)


def test_close_round_awards_points_from_events(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    season = fantasy_season
    first = season.fantasy_teams["первая"].id
    second = season.fantasy_teams["вторая"].id
    match_id = season.matches["альфа-бета"].id
    player = {surname: p.id for surname, p in season.players.items()}
    event = {name: e.id for name, e in season.events.items()}

    response = close(client, season.rounds[1].id, users[UserRole.ADMIN])

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == season.rounds[1].id
    assert body["number"] == 1
    assert body["closed_at"] is not None
    # Отменённый матч Бета — Гамма не даёт ничего, даже очков за «сыграл».
    assert [
        (
            e.fantasy_team_id,
            e.player_id,
            e.match_id,
            e.event_id,
            e.minute,
            e.reason,
            e.points,
        )
        for e in journal(season.rounds[1].id)
    ] == [
        (first, player["Орлов"], match_id, event["гол Орлова"], 10, "goal", 4),
        (first, player["Белов"], match_id, event["гол Орлова"], 10, "assist", 3),
        (
            first,
            player["Зайцев"],
            match_id,
            event["автогол Зайцева"],
            30,
            "own_goal",
            -2,
        ),
        (
            first,
            player["Белов"],
            match_id,
            event["жёлтая Белова"],
            40,
            "yellow_card",
            -1,
        ),
        (first, player["Орлов"], match_id, None, None, "played", 1),
        (first, player["Белов"], match_id, None, None, "played", 1),
        (first, player["Зайцев"], match_id, None, None, "played", 1),
        (second, player["Котов"], match_id, event["гол Котова"], 60, "goal", 4),
        (second, player["Котов"], match_id, None, None, "played", 1),
    ]
    assert totals(season.rounds[1].id) == {first: 7, second: 5}


def test_close_round_twice_keeps_journal(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    round_id = fantasy_season.rounds[1].id
    admin = users[UserRole.ADMIN]
    first_response = close(client, round_id, admin)
    rows_after_first_close = journal_rows(round_id)

    second_response = close(client, round_id, admin)

    assert second_response.status_code == 200
    assert second_response.json() == first_response.json()
    assert journal_rows(round_id) == rows_after_first_close


async def _delete_event(event_id: int) -> None:
    async with session_maker() as db:
        await db.execute(
            delete(models.MatchEvent).where(models.MatchEvent.id == event_id)
        )
        await db.commit()


async def _move_event(event_id: int, minute: int) -> None:
    async with session_maker() as db:
        await db.execute(
            update(models.MatchEvent)
            .where(models.MatchEvent.id == event_id)
            .values(minute=minute)
        )
        await db.commit()


def test_editing_events_after_close_keeps_points(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    round_id = fantasy_season.rounds[1].id
    deleted_goal = fantasy_season.events["гол Орлова"].id
    moved_card = fantasy_season.events["жёлтая Белова"].id
    close(client, round_id, users[UserRole.ADMIN])
    totals_before = totals(round_id)
    rows_before = journal_rows(round_id)

    asyncio.run(_delete_event(deleted_goal))
    asyncio.run(_move_event(moved_card, minute=89))
    close(client, round_id, users[UserRole.ADMIN])

    assert totals(round_id) == totals_before
    # Строки журнала остались те же. У строк удалённого гола пропала
    # только ссылка на событие, минута и очки сохранились снимком.
    expected = [
        (*row[:4], None if row[4] == deleted_goal else row[4], *row[5:])
        for row in rows_before
    ]
    assert journal_rows(round_id) == expected
    card_minutes = [e.minute for e in journal(round_id) if e.event_id == moved_card]
    assert card_minutes == [40]


def test_previous_lineup_used_when_none_submitted(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    season = fantasy_season
    first = season.fantasy_teams["первая"].id
    second = season.fantasy_teams["вторая"].id

    response = close(client, season.rounds[2].id, users[UserRole.ADMIN])

    assert response.status_code == 200
    # Первая команда не прислала состав на тур 2 и играет составом тура 1
    # (Орлов, Белов, Зайцев), а не составом более позднего тура 3.
    # Зайцев из Беты в туре 2 не играл.
    lines = {
        (e.fantasy_team_id, season_player_name(season, e.player_id), e.reason)
        for e in journal(season.rounds[2].id)
    }
    assert lines == {
        (first, "Орлов", "red_card"),
        (first, "Орлов", "played"),
        (first, "Белов", "played"),
        (second, "Лебедев", "goal"),
        (second, "Лебедев", "played"),
        (second, "Орлов", "red_card"),
        (second, "Орлов", "played"),
    }
    assert totals(season.rounds[2].id) == {first: -1, second: 3}


def season_player_name(season: FantasySeason, player_id: int) -> str:
    return next(
        surname for surname, player in season.players.items() if player.id == player_id
    )


def test_close_round_with_unfinished_match_is_409(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    round_id = fantasy_season.rounds[3].id
    live_match_id = fantasy_season.matches["бета-гамма идёт"].id

    response = close(client, round_id, users[UserRole.ADMIN])

    assert response.status_code == 409
    assert response.json() == {
        "detail": f"Тур пока нельзя закрыть. Матч {live_match_id} "
        "ещё не завершён и не отменён (статус: live)."
    }
    assert journal(round_id) == []
    assert close_state(round_id) is None


def test_close_round_without_matches_is_409(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
):
    round_id = fantasy_season.rounds[4].id

    response = close(client, round_id, users[UserRole.ADMIN])

    assert response.status_code == 409
    assert response.json() == {
        "detail": "В туре нет ни одного матча, закрывать нечего."
    }
    assert close_state(round_id) is None


async def _closed_at(round_id: int) -> datetime | None:
    async with session_maker() as db:
        return await db.scalar(
            select(models.Round.closed_at).where(models.Round.id == round_id)
        )


def close_state(round_id: int) -> datetime | None:
    return asyncio.run(_closed_at(round_id))


@pytest.mark.parametrize("role", [UserRole.VIEWER, UserRole.OPERATOR])
def test_close_round_is_admin_only(
    client: TestClient,
    fantasy_season: FantasySeason,
    users: dict[UserRole, models.User],
    role: UserRole,
):
    round_id = fantasy_season.rounds[1].id

    response = close(client, round_id, users[role])

    assert response.status_code == 403
    assert response.json() == {"detail": "Недостаточно прав"}
    assert close_state(round_id) is None


def test_close_round_without_token_is_401(
    client: TestClient, fantasy_season: FantasySeason
):
    round_id = fantasy_season.rounds[1].id

    response = close(client, round_id, None)

    assert response.status_code == 401
    assert response.json() == {"detail": "Нужно войти"}
    assert close_state(round_id) is None


def test_close_missing_round_is_404(
    client: TestClient, users: dict[UserRole, models.User]
):
    response = close(client, MISSING_ID, users[UserRole.ADMIN])

    assert response.status_code == 404
    assert response.json() == {"detail": "Тур не найден"}


async def _close_twice_at_once(round_id: int) -> None:
    async with session_maker() as first_db, session_maker() as second_db:
        await asyncio.gather(
            close_round(db=first_db, round_id=round_id),
            close_round(db=second_db, round_id=round_id),
        )


def test_simultaneous_closes_award_points_once(fantasy_season: FantasySeason):
    round_id = fantasy_season.rounds[1].id

    asyncio.run(_close_twice_at_once(round_id))

    # Без блокировки строки тура оба закрытия увидели бы открытый тур
    # и записали бы журнал дважды: 18 строк вместо 9.
    assert len(journal(round_id)) == 9
    assert totals(round_id) == {
        fantasy_season.fantasy_teams["первая"].id: 7,
        fantasy_season.fantasy_teams["вторая"].id: 5,
    }


def test_fantasy_rules(client: TestClient):
    response = client.get("/api/fantasy/rules")

    assert response.status_code == 200
    assert response.json() == {
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
