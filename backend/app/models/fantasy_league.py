from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.fantasy_team import FantasyTeam

# Какие фэнтези-команды состоят в лиге. Одна команда может быть
# в нескольких лигах: с одногруппниками, с соседями по общежитию.
fantasy_league_members = Table(
    "fantasy_league_members",
    Base.metadata,
    Column(
        "league_id",
        ForeignKey("fantasy_leagues.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "fantasy_team_id",
        ForeignKey("fantasy_teams.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class FantasyLeague(Base):
    """Частная лига: свой рейтинг для тех, кто вошёл по коду приглашения."""

    __tablename__ = "fantasy_leagues"

    id: Mapped[int] = mapped_column(primary_key=True)
    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))
    # Код, по которому вступают в лигу. Уникален во всей базе,
    # чтобы по одному коду сразу находилась лига.
    invite_code: Mapped[str] = mapped_column(String(12), unique=True)
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )

    members: Mapped[list["FantasyTeam"]] = relationship(
        secondary=fantasy_league_members
    )
