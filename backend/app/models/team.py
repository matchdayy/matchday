from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.player import Player
    from app.models.tournament import Tournament


class Team(TimestampMixin, Base):
    """Команда внутри одного турнира."""

    __tablename__ = "teams"
    __table_args__ = (
        # В одном турнире не может быть двух команд с одинаковым названием.
        UniqueConstraint("tournament_id", "name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # ondelete="CASCADE": удалили турнир — его команды удаляются вместе с ним.
    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    # Ссылка на картинку. Как загружать файлы — решим отдельной задачей.
    logo_url: Mapped[str | None] = mapped_column(String(500))

    tournament: Mapped["Tournament"] = relationship(back_populates="teams")
    players: Mapped[list["Player"]] = relationship(
        back_populates="team", cascade="all, delete-orphan", passive_deletes=True
    )
