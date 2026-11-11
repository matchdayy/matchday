import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.match_event import MatchEvent
    from app.models.match_status_change import MatchStatusChange
    from app.models.round import Round
    from app.models.team import Team
    from app.models.tournament import Tournament


class MatchStatus(enum.StrEnum):
    SCHEDULED = "scheduled"  # запланирован
    LIVE = "live"  # идёт прямо сейчас
    PAUSED = "paused"  # перерыв или остановка: игровое время стоит
    FINISHED = "finished"  # завершён
    CANCELLED = "cancelled"  # отменён


def match_status_type() -> Enum:
    """Тип колонки со статусом матча: у матча и в журнале смены статусов он один.

    native_enum=False: в базе это обычная строка с проверкой на допустимые
    значения, а не тип ENUM. Новый статус добавляется простой миграцией.
    Объект создаётся заново для каждой колонки: проверка (CHECK) привязывается
    к своей таблице.
    """
    return Enum(
        MatchStatus,
        native_enum=False,
        create_constraint=True,
        length=20,
        name="status",
        values_callable=lambda e: [item.value for item in e],
    )


class Match(TimestampMixin, Base):
    """Матч двух команд одного турнира.

    Счёт здесь не хранится: он считается по событиям «гол» из таблицы
    match_events. Гол идёт команде забившего, автогол (is_own_goal) —
    команде соперника. Так счёт не может разойтись с лентой событий.
    """

    __tablename__ = "matches"
    __table_args__ = (
        # Команда не играет сама с собой.
        CheckConstraint("home_team_id <> away_team_id", name="different_teams"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    # Удалить команду, у которой есть матчи, нельзя: база выдаст ошибку.
    # Сначала нужно удалить или переназначить её матчи.
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    # Дата и время начала с часовым поясом.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    venue: Mapped[str | None] = mapped_column(String(200))
    # Статус меняйте через record_status_change из app/services/match_clock.py:
    # она заодно пишет журнал, по которому считается игровое время.
    status: Mapped[MatchStatus] = mapped_column(
        match_status_type(),
        default=MatchStatus.SCHEDULED,
        server_default=MatchStatus.SCHEDULED.value,
    )
    # Тур нужен фэнтези-лиге. Удалили тур — матч остаётся, просто без тура.
    round_id: Mapped[int | None] = mapped_column(
        ForeignKey("rounds.id", ondelete="SET NULL"), index=True
    )

    tournament: Mapped["Tournament"] = relationship(back_populates="matches")
    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])
    events: Mapped[list["MatchEvent"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="MatchEvent.minute",
    )
    round: Mapped["Round | None"] = relationship(back_populates="matches")
    status_changes: Mapped[list["MatchStatusChange"]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
        passive_deletes=True,
        # По id — на случай двух смен статуса с одинаковым временем.
        order_by="[MatchStatusChange.changed_at, MatchStatusChange.id]",
    )
