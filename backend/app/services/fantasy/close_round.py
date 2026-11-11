"""Закрытие тура: очки фэнтези считаются один раз и записываются в журнал.

Здесь движок из scoring.py встречается с базой: матчи тура и составы
загружаются из моделей, переводятся в простые dataclass'ы, а строки
начислений записываются в fantasy_points.

После закрытия журнал не пересчитывается. Правка или удаление события
в матче закрытого тура меняет счёт и таблицу, но не фэнтези-очки:
в журнале минута хранится снимком, а ссылка на удалённое событие
становится пустой (см. FantasyPointsEntry).
"""

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    FantasyLineup,
    FantasyPointsEntry,
    FantasyPointsReason,
    Match,
    MatchEvent,
    Round,
)
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
from app.services.score import EVENTS_WITH_PLAYERS


class RoundNotFoundError(LookupError):
    """Тура с таким id нет."""


class RoundNotReadyError(Exception):
    """Тур пока нельзя закрыть. Текст ошибки можно показать администратору."""


async def close_round(*, db: AsyncSession, round_id: int) -> Round:
    """Закрывает тур и начисляет очки. Закрытый тур возвращает как есть.

    Сама фиксирует транзакцию: блокировка строки тура держится до конца
    записи журнала и снимается только после неё.
    """
    round_ = await _lock_round(db=db, round_id=round_id)
    if round_.closed_at is not None:
        await db.commit()
        return round_
    matches = await _load_round_matches(db=db, round_id=round_id)
    _check_can_close(matches=matches)
    lineups = resolve_lineups(
        submitted=await _load_submitted_lineups(db=db, round_id=round_id),
        previous=await _load_previous_lineups(db=db, round_=round_),
    )
    lines = score_round(matches=matches, lineups=lineups)
    db.add_all(_journal_entries(round_id=round_id, lines=lines))
    round_.closed_at = datetime.now(tz=UTC)
    await db.commit()
    return round_


async def _lock_round(*, db: AsyncSession, round_id: int) -> Round:
    # FOR UPDATE: второе одновременное закрытие ждёт здесь, пока первое
    # не зафиксирует транзакцию, и потом видит уже заполненный closed_at.
    # Без блокировки оба увидели бы открытый тур и начислили очки дважды.
    # populate_existing: если тур уже был в сессии, берём свежие значения
    # из базы, а не старые из памяти.
    round_ = await db.scalar(
        select(Round)
        .where(Round.id == round_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if round_ is None:
        raise RoundNotFoundError(round_id)
    return round_


def _check_can_close(*, matches: list[RoundMatch]) -> None:
    # Закрытие нельзя отменить. Пустой тур, закрытый по ошибке до того,
    # как в него добавили матчи, так и остался бы без очков.
    if not matches:
        raise RoundNotReadyError("В туре нет ни одного матча, закрывать нечего.")
    problems = can_close_round(matches)
    if problems:
        raise RoundNotReadyError(" ".join(["Тур пока нельзя закрыть.", *problems]))


async def _load_round_matches(*, db: AsyncSession, round_id: int) -> list[RoundMatch]:
    matches = await db.scalars(
        select(Match)
        .where(Match.round_id == round_id)
        .options(EVENTS_WITH_PLAYERS)
        .order_by(Match.id)
    )
    return [_round_match(match) for match in matches]


def _round_match(match: Match) -> RoundMatch:
    return RoundMatch(
        id=match.id,
        status=match.status,
        home_team_id=match.home_team_id,
        away_team_id=match.away_team_id,
        events=tuple(_round_event(event) for event in match.events),
    )


def _round_event(event: MatchEvent) -> RoundEvent:
    return RoundEvent(
        id=event.id,
        type=event.type,
        minute=event.minute,
        player_id=event.player_id,
        player_team_id=event.player.team_id,
        assist_player_id=event.assist_player_id,
        is_own_goal=event.is_own_goal,
    )


async def _load_submitted_lineups(
    *, db: AsyncSession, round_id: int
) -> list[TeamLineup]:
    lineups = await db.scalars(
        select(FantasyLineup)
        .where(FantasyLineup.round_id == round_id)
        .options(selectinload(FantasyLineup.players))
    )
    return [_team_lineup(lineup) for lineup in lineups]


async def _load_previous_lineups(
    *, db: AsyncSession, round_: Round
) -> list[PastLineup]:
    """Составы из туров того же турнира с меньшим номером."""
    rows = await db.execute(
        select(FantasyLineup, Round.number)
        .join(Round, FantasyLineup.round_id == Round.id)
        .where(
            Round.tournament_id == round_.tournament_id,
            Round.number < round_.number,
        )
        .options(selectinload(FantasyLineup.players))
    )
    return [
        PastLineup(round_number=number, lineup=_team_lineup(lineup))
        for lineup, number in rows
    ]


def _team_lineup(lineup: FantasyLineup) -> TeamLineup:
    players = sorted(lineup.players, key=lambda player: player.id)
    return TeamLineup(
        fantasy_team_id=lineup.fantasy_team_id,
        player_ids=tuple(player.id for player in players),
        player_team_ids={player.id: player.team_id for player in players},
    )


def _journal_entries(
    *, round_id: int, lines: Iterable[PointsLine]
) -> list[FantasyPointsEntry]:
    return [
        FantasyPointsEntry(
            round_id=round_id,
            fantasy_team_id=line.fantasy_team_id,
            player_id=line.player_id,
            match_id=line.match_id,
            event_id=line.event_id,
            minute=line.minute,
            reason=FantasyPointsReason(line.reason.value),
            points=line.points,
        )
        for line in lines
    ]
