from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.team import Team


class Player(TimestampMixin, Base):
    """Игрок одной команды.

    Если студент играет в двух турнирах, у него две записи: по одной
    в каждой команде.
    """

    __tablename__ = "players"
    __table_args__ = (
        # В одной команде номера не повторяются. Игроков без номера
        # может быть сколько угодно: Postgres не сравнивает пустые значения.
        UniqueConstraint("team_id", "number"),
        CheckConstraint("number BETWEEN 0 AND 99", name="number_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    full_name: Mapped[str] = mapped_column(String(150))
    # Позиция свободным текстом: «вратарь», «защитник», «разыгрывающий».
    # В разных видах спорта они разные, поэтому без фиксированного списка.
    position: Mapped[str | None] = mapped_column(String(30))
    number: Mapped[int | None] = mapped_column(SmallInteger)
    photo_url: Mapped[str | None] = mapped_column(String(500))

    team: Mapped["Team"] = relationship(back_populates="players")
