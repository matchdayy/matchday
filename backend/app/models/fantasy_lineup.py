from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.fantasy_team import FantasyTeam
    from app.models.player import Player
    from app.models.round import Round

# Кто из игроков входит в состав на тур. Отдельной модели не нужно:
# кроме пары «состав — игрок» здесь ничего не хранится.
fantasy_lineup_players = Table(
    "fantasy_lineup_players",
    Base.metadata,
    Column(
        "lineup_id",
        ForeignKey("fantasy_lineups.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "player_id",
        ForeignKey("players.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class FantasyLineup(Base):
    """Состав фэнтези-команды на один тур.

    Меняется до дедлайна тура. Если на тур состава нет, при подсчёте
    очков берётся последний состав из прошлых туров — поэтому копировать
    состав на каждый тур заранее не нужно.
    """

    __tablename__ = "fantasy_lineups"
    __table_args__ = (UniqueConstraint("fantasy_team_id", "round_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    fantasy_team_id: Mapped[int] = mapped_column(
        ForeignKey("fantasy_teams.id", ondelete="CASCADE")
    )
    round_id: Mapped[int] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"), index=True
    )

    fantasy_team: Mapped["FantasyTeam"] = relationship()
    round: Mapped["Round"] = relationship()
    players: Mapped[list["Player"]] = relationship(secondary=fantasy_lineup_players)
