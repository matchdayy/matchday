"""Статус турнира по датам: ещё не начался, идёт или закончился.

Статус не хранится в базе, а считается по датам начала и конца
относительно сегодняшнего дня. Так его не нужно переключать руками.
"""

import enum
from datetime import UTC, date, datetime


class TournamentStatus(enum.StrEnum):
    UPCOMING = "upcoming"  # ещё не начался
    ONGOING = "ongoing"  # идёт: сегодня между датой начала и конца включительно
    FINISHED = "finished"  # закончился


def today_utc() -> date:
    """Сегодняшняя дата по UTC — одна и та же на любом сервере."""
    return datetime.now(tz=UTC).date()


def tournament_status(
    *, start_date: date, end_date: date, today: date
) -> TournamentStatus:
    if today < start_date:
        return TournamentStatus.UPCOMING
    if today > end_date:
        return TournamentStatus.FINISHED
    return TournamentStatus.ONGOING
