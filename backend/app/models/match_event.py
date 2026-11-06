import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Enum, ForeignKey, SmallInteger, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.match import Match
    from app.models.player import Player


class MatchEventType(enum.StrEnum):
    GOAL = "goal"  # гол
    YELLOW_CARD = "yellow_card"  # жёлтая карточка
    RED_CARD = "red_card"  # красная карточка


class MatchEvent(TimestampMixin, Base):
    """Одно событие в ленте матча: гол или карточка.

    Голевая передача — не отдельное событие, а поле assist_player_id
    у гола. Так одна передача не может попасть в статистику дважды.

    Автогол — это гол с is_own_goal = true: player_id указывает на того,
    кто забил в свои ворота, а гол засчитывается команде соперника.
    """

    __tablename__ = "match_events"
    __table_args__ = (
        CheckConstraint("minute BETWEEN 0 AND 150", name="minute_range"),
        # Ассистент бывает только у гола.
        CheckConstraint(
            "assist_player_id IS NULL OR type = 'goal'", name="assist_only_for_goal"
        ),
        # Автоголом может быть только гол, и передачи у автогола не бывает.
        CheckConstraint(
            "NOT is_own_goal OR (type = 'goal' AND assist_player_id IS NULL)",
            name="own_goal_only_for_goal",
        ),
        # Игрок не может отдать передачу сам себе.
        CheckConstraint(
            "assist_player_id IS NULL OR assist_player_id <> player_id",
            name="assist_not_scorer",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Удалили матч — удалилась и его лента событий.
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[MatchEventType] = mapped_column(
        Enum(
            MatchEventType,
            native_enum=False,
            create_constraint=True,
            length=20,
            name="type",
            values_callable=lambda e: [item.value for item in e],
        )
    )
    minute: Mapped[int] = mapped_column(SmallInteger)
    # Кто забил гол или получил карточку.
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    # Кто отдал голевую передачу. Пусто, если передачи не было или это карточка.
    assist_player_id: Mapped[int | None] = mapped_column(
        ForeignKey("players.id"), index=True
    )

    # Гол в свои ворота. Важен для счёта и для сухих матчей вратарей.
    is_own_goal: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )

    match: Mapped["Match"] = relationship(back_populates="events")
    player: Mapped["Player"] = relationship(foreign_keys=[player_id])
    assist_player: Mapped["Player | None"] = relationship(
        foreign_keys=[assist_player_id]
    )
