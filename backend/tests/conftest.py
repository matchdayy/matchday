"""Общие фикстуры тестов.

Тесты ручек ходят в настоящую базу из APP_DATABASE_URL: в CI это чистый
Postgres после alembic upgrade head. Каждый тест сам создаёт нужные данные
и удаляет их после себя, чужие записи в базе он не трогает.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app import models
from app.config import settings
from app.database import get_db
from app.main import app
from app.models import MatchEventType, MatchStatus, UserRole
from app.services.tournament_status import today_utc

# TestClient запускает каждый запрос в своём цикле событий asyncio.
# Соединение asyncpg привязано к циклу, в котором открыто, поэтому
# переиспользовать соединения между запросами нельзя. NullPool открывает
# новое соединение на каждую сессию и закрывает его после.
nullpool_engine = create_async_engine(settings.database_url, poolclass=NullPool)
session_maker = async_sessionmaker(nullpool_engine, expire_on_commit=False)


async def get_test_db() -> AsyncIterator[AsyncSession]:
    async with session_maker() as session:
        yield session


app.dependency_overrides[get_db] = get_test_db


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@dataclass
class SampleTournament:
    """Турнир, который фикстура sample_tournament положила в базу."""

    tournament: models.Tournament
    teams: dict[str, models.Team] = field(default_factory=dict)
    """Команды по названию."""
    players: dict[str, models.Player] = field(default_factory=dict)
    """Игроки по имени."""
    matches: list[models.Match] = field(default_factory=list)
    """Завершённый, идущий и запланированный матчи — в таком порядке."""


@pytest.fixture
def sample_tournament() -> Iterator[SampleTournament]:
    """Маленький турнир в базе. Удаляется после теста.

    Три команды: Альфа, Бета, Гамма.
    - Завершённый матч Альфа — Бета 2:1: гол Орлова с передачей Белова,
      автогол Зайцева (идёт Альфе), гол Зайцева. Жёлтая у Белова.
    - Идущий матч Бета — Альфа 1:0: гол Зайцева. В таблицу не идёт.
    - Запланированный матч Альфа — Гамма. Счёта нет.
    У Гаммы нет сыгранных матчей.
    """
    sample = asyncio.run(_create_sample_tournament())
    yield sample
    asyncio.run(_delete_tournament(sample.tournament.id))


async def _create_sample_tournament() -> SampleTournament:
    today = today_utc()
    async with session_maker() as db:
        tournament = models.Tournament(
            name="Тестовый кубок",
            sport="football",
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=30),
        )
        sample = SampleTournament(tournament=tournament)
        for name in ["Альфа", "Бета", "Гамма"]:
            sample.teams[name] = models.Team(tournament=tournament, name=name)
        for name, team, number in [
            ("Никита Орлов", "Альфа", 9),
            ("Артём Белов", "Альфа", 8),
            ("Павел Зайцев", "Бета", 1),
        ]:
            sample.players[name] = models.Player(
                team=sample.teams[team], full_name=name, number=number
            )
        db.add(tournament)
        db.add_all([*sample.teams.values(), *sample.players.values()])
        await db.flush()
        sample.matches = _sample_matches(sample)
        db.add_all(sample.matches)
        await db.commit()
    return sample


def _sample_matches(sample: SampleTournament) -> list[models.Match]:
    teams, players = sample.teams, sample.players
    start = datetime.now(tz=UTC).replace(microsecond=0)

    def match(home: str, away: str, hours: int, status: MatchStatus) -> models.Match:
        return models.Match(
            tournament=sample.tournament,
            home_team=teams[home],
            away_team=teams[away],
            starts_at=start + timedelta(hours=hours),
            status=status,
        )

    def event(
        event_type: MatchEventType, player: str, **extra: object
    ) -> models.MatchEvent:
        return models.MatchEvent(
            type=event_type, minute=10, player=players[player], **extra
        )

    finished = match("Альфа", "Бета", -48, MatchStatus.FINISHED)
    finished.events = [
        event(
            MatchEventType.GOAL, "Никита Орлов", assist_player=players["Артём Белов"]
        ),
        event(MatchEventType.GOAL, "Павел Зайцев", is_own_goal=True),
        event(MatchEventType.GOAL, "Павел Зайцев"),
        event(MatchEventType.YELLOW_CARD, "Артём Белов"),
    ]
    live = match("Бета", "Альфа", -1, MatchStatus.LIVE)
    live.events = [event(MatchEventType.GOAL, "Павел Зайцев")]
    scheduled = match("Альфа", "Гамма", 48, MatchStatus.SCHEDULED)
    return [finished, live, scheduled]


async def _delete_tournament(tournament_id: int) -> None:
    # Команды, игроки, матчи и события удаляются каскадом в базе
    # (ondelete="CASCADE" в моделях).
    async with session_maker() as db:
        await db.execute(
            delete(models.Tournament).where(models.Tournament.id == tournament_id)
        )
        await db.commit()


@pytest.fixture
def users() -> Iterator[dict[UserRole, models.User]]:
    """По пользователю на каждую роль. Удаляются после теста.

    Почта у каждого запуска своя, чтобы не столкнуться с чужими записями.
    Хеш пароля ненастоящий: для проверки ролей и токенов пароль не нужен.
    """
    created = asyncio.run(_create_users())
    yield created
    asyncio.run(_delete_users([user.id for user in created.values()]))


async def _create_users() -> dict[UserRole, models.User]:
    run_id = uuid.uuid4().hex[:12]
    created = {
        role: models.User(
            email=f"{role.value}-{run_id}@example.com",
            display_name=f"Тестовый {role.value}",
            password_hash="не-хеш",
            role=role,
            pd_consent_at=datetime.now(tz=UTC),
        )
        for role in UserRole
    }
    async with session_maker() as db:
        db.add_all(created.values())
        await db.commit()
    return created


async def _delete_users(user_ids: list[int]) -> None:
    # Голоса, фэнтези-команды и лиги пользователя удаляются каскадом в базе.
    async with session_maker() as db:
        await db.execute(delete(models.User).where(models.User.id.in_(user_ids)))
        await db.commit()
