"""Ограничения базы, на которые опираются ручки.

Ручка может проверить «уже голосовал» заранее, но два одновременных
запроса проскочат такую проверку. Последняя линия защиты — уникальность
в самой базе, её и проверяем.
"""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Match,
    MatchEvent,
    MatchEventType,
    MatchStatus,
    MvpVote,
    User,
    UserRole,
)
from app.services.match_clock import STATUS_CHANGES, match_clock, record_status_change
from tests.conftest import SampleTournament, session_maker


def test_one_mvp_vote_per_match_and_user(
    sample_tournament: SampleTournament, users: dict[UserRole, User]
):
    match_id = sample_tournament.matches[0].id
    user_id = users[UserRole.VIEWER].id
    first = sample_tournament.players["Никита Орлов"]
    second = sample_tournament.players["Павел Зайцев"]

    async def vote_twice() -> None:
        async with session_maker() as db:
            db.add(MvpVote(match_id=match_id, user_id=user_id, player_id=first.id))
            await db.commit()
            db.add(MvpVote(match_id=match_id, user_id=user_id, player_id=second.id))
            await db.commit()

    with pytest.raises(IntegrityError):
        asyncio.run(vote_twice())


def test_event_client_id_is_unique(sample_tournament: SampleTournament):
    match_id = sample_tournament.matches[1].id
    player_id = sample_tournament.players["Павел Зайцев"].id
    client_id = uuid.uuid4()

    def goal() -> MatchEvent:
        return MatchEvent(
            match_id=match_id,
            type=MatchEventType.GOAL,
            minute=50,
            player_id=player_id,
            client_id=client_id,
        )

    async def send_twice() -> None:
        async with session_maker() as db:
            db.add(goal())
            await db.commit()
            db.add(goal())
            await db.commit()

    with pytest.raises(IntegrityError):
        asyncio.run(send_twice())


def test_status_journal_round_trip(sample_tournament: SampleTournament):
    match_id = sample_tournament.matches[2].id
    kickoff = datetime(2026, 11, 12, 18, 30, tzinfo=UTC)
    pause = kickoff + timedelta(minutes=20)

    async def play_and_reload() -> Match:
        async with session_maker() as db:
            match = await db.scalar(
                select(Match).where(Match.id == match_id).options(STATUS_CHANGES)
            )
            record_status_change(match=match, status=MatchStatus.LIVE, at=kickoff)
            record_status_change(match=match, status=MatchStatus.PAUSED, at=pause)
            await db.commit()
        async with session_maker() as db:
            return await db.scalar(
                select(Match).where(Match.id == match_id).options(STATUS_CHANGES)
            )

    match = asyncio.run(play_and_reload())

    assert match.status == MatchStatus.PAUSED
    assert [change.status for change in match.status_changes] == [
        MatchStatus.LIVE,
        MatchStatus.PAUSED,
    ]
    clock = match_clock(
        status=match.status,
        changes=match.status_changes,
        now=pause + timedelta(minutes=5),
    )
    assert clock is not None
    assert clock.elapsed_seconds == 20 * 60
