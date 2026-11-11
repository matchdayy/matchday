from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.match import MatchStatus, match_status_type

if TYPE_CHECKING:
    from app.models.match import Match


class MatchStatusChange(Base):
    """Одна смена статуса матча: в какой статус и когда.

    По этому журналу считается игровое время (app/services/match_clock.py):
    сумма отрезков, когда матч был в статусе live. Хранить отдельно
    «сколько минут сыграно» не нужно, а пауза просто останавливает отсчёт.
    """

    __tablename__ = "match_status_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("matches.id", ondelete="CASCADE"), index=True
    )
    # Статус, в который матч перешёл в момент changed_at.
    status: Mapped[MatchStatus] = mapped_column(match_status_type())
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    match: Mapped["Match"] = relationship(back_populates="status_changes")
