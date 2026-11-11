import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.player import Player


class FantasyPointsReason(enum.StrEnum):
    GOAL = "goal"  # забил
    ASSIST = "assist"  # отдал голевую передачу
    PLAYED = "played"  # сыграл матч
    YELLOW_CARD = "yellow_card"  # жёлтая карточка
    RED_CARD = "red_card"  # красная карточка
    OWN_GOAL = "own_goal"  # гол в свои ворота


class FantasyPointsEntry(TimestampMixin, Base):
    """Одна строка журнала начислений фэнтези-очков.

    Очки пишутся один раз, когда администратор закрывает тур, и после этого
    не меняются. Счёт и таблица считаются по ленте событий на лету, а итоги
    закрытого тура — нет: правка или удаление события после закрытия тура
    меняет счёт, но не фэнтези-очки. Поэтому:

    - event_id при удалении события становится пустым (ondelete="SET NULL"),
      а строка журнала остаётся;
    - minute — снимок минуты события на момент закрытия тура, а не ссылка:
      если минуту события потом поправят, в журнале останется старая.

    Очки за выход на поле (reason=played) ни к какому событию не привязаны,
    у них event_id и minute пустые.
    """

    __tablename__ = "fantasy_points"

    id: Mapped[int] = mapped_column(primary_key=True)
    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )
    fantasy_team_id: Mapped[int] = mapped_column(
        ForeignKey("fantasy_teams.id", ondelete="CASCADE"), index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[int | None] = mapped_column(
        ForeignKey("match_events.id", ondelete="SET NULL"), index=True
    )
    minute: Mapped[int | None] = mapped_column(SmallInteger)
    reason: Mapped[FantasyPointsReason] = mapped_column(
        Enum(
            FantasyPointsReason,
            native_enum=False,
            create_constraint=True,
            length=20,
            name="reason",
            values_callable=lambda e: [item.value for item in e],
        )
    )
    # Может быть отрицательным: карточки и автогол отнимают очки.
    points: Mapped[int] = mapped_column(SmallInteger)

    player: Mapped["Player"] = relationship()
