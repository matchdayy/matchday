"""Игровое время матча по журналу смены статусов.

Время нигде не хранится и не тикает на сервере. Каждый переход статуса
записывается в match_status_changes с отметкой времени, а сыгранное время —
это сумма отрезков, когда матч был в статусе live. Пауза (paused) просто
не входит в сумму. Так время переживает перезапуск сервера, и все зрители
видят одну и ту же минуту.

Менять статус матча нужно через record_status_change, иначе журнал
разойдётся со статусом и время будет неверным:

    match = await db.scalar(
        select(Match).where(Match.id == match_id).options(STATUS_CHANGES)
    )
    record_status_change(match=match, status=MatchStatus.PAUSED)
    await db.commit()

    clock = match_clock(
        status=match.status, changes=match.status_changes, now=datetime.now(tz=UTC)
    )

Какие переходы допустимы (из scheduled в live, из live в paused и т. д.),
здесь не проверяется — это решает ручка смены статуса.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import selectinload

from app.models import Match, MatchStatus, MatchStatusChange

# Как у событий матча: минута события не больше 150 (ck_match_events_minute_range).
MAX_MINUTE = 150

# Готовая настройка загрузки журнала для запроса матча, по аналогии
# с EVENTS_WITH_PLAYERS в score.py. Без неё в асинхронной сессии
# обращение к match.status_changes упадёт с MissingGreenlet.
STATUS_CHANGES = selectinload(Match.status_changes)


@dataclass(frozen=True)
class MatchClock:
    """Игровое время матча для ответа API."""

    elapsed_seconds: int
    """Сколько секунд матч был в статусе live, без пауз."""
    running: bool
    """Идёт ли время прямо сейчас: только в статусе live."""
    minute: int
    """Текущая минута как на табло: первая минута — 1. Не больше 150."""


def match_clock(
    *, status: MatchStatus, changes: Sequence[MatchStatusChange], now: datetime
) -> MatchClock | None:
    """Игровое время. None — у запланированного и отменённого матча его нет."""
    if status in (MatchStatus.SCHEDULED, MatchStatus.CANCELLED):
        return None
    elapsed_seconds = _live_seconds(changes=changes, now=now)
    return MatchClock(
        elapsed_seconds=elapsed_seconds,
        running=status == MatchStatus.LIVE,
        minute=min(elapsed_seconds // 60 + 1, MAX_MINUTE),
    )


def _live_seconds(*, changes: Sequence[MatchStatusChange], now: datetime) -> int:
    """Сумма отрезков в статусе live. Последний отрезок длится до now."""
    ordered = sorted(changes, key=lambda change: change.changed_at)
    total = 0.0
    for change, next_change in zip(ordered, [*ordered[1:], None]):
        if change.status != MatchStatus.LIVE:
            continue
        ended_at = next_change.changed_at if next_change is not None else now
        # max: если часы сервера и отметка в журнале чуть разошлись,
        # отрезок не должен уменьшать время.
        total += max((ended_at - change.changed_at).total_seconds(), 0.0)
    return int(total)


def record_status_change(
    *, match: Match, status: MatchStatus, at: datetime | None = None
) -> MatchStatusChange:
    """Меняет статус матча и пишет переход в журнал.

    at — когда это произошло; по умолчанию сейчас. Журнал матча
    (match.status_changes) должен быть загружен — см. STATUS_CHANGES.
    """
    change = MatchStatusChange(status=status, changed_at=at or datetime.now(tz=UTC))
    match.status = status
    match.status_changes.append(change)
    return change
