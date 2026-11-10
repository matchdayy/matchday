from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.match import Match
    from app.models.team import Team


class Tournament(TimestampMixin, Base):
    """Турнир: например, «Кубок первокурсников 2026» по футболу."""

    __tablename__ = "tournaments"
    __table_args__ = (
        # Турнир не может закончиться раньше, чем начался.
        CheckConstraint("end_date >= start_date", name="dates_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Вид спорта латиницей: football, basketball, volleyball...
    # Строка, а не фиксированный список: новые виды спорта добавляются
    # без миграции.
    sport: Mapped[str] = mapped_column(String(50))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)

    teams: Mapped[list["Team"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan", passive_deletes=True
    )
    matches: Mapped[list["Match"]] = relationship(
        back_populates="tournament", cascade="all, delete-orphan", passive_deletes=True
    )
