from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.match import Match
    from app.models.tournament import Tournament


class Round(Base):
    """Тур турнира: группа матчей, по которой считаются очки фэнтези-лиги.

    До дедлайна участники фэнтези меняют составы. Когда все матчи тура
    сыграны, администратор закрывает тур: очки начисляются один раз
    и после этого не меняются.
    """

    __tablename__ = "rounds"
    __table_args__ = (
        # В турнире один «Тур 1», один «Тур 2» и так далее.
        UniqueConstraint("tournament_id", "number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(SmallInteger)
    # Как показывать тур: «Тур 1», «Полуфинал».
    title: Mapped[str] = mapped_column(String(50))
    # До этого момента можно менять фэнтези-составы на тур.
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Когда администратор закрыл тур. Пусто — тур ещё открыт.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tournament: Mapped["Tournament"] = relationship(back_populates="rounds")
    # Удалили тур — его матчи остаются, у них просто пропадает тур
    # (ondelete="SET NULL" у Match.round_id).
    matches: Mapped[list["Match"]] = relationship(
        back_populates="round", passive_deletes=True
    )
