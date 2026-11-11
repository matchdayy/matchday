from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.tournament import Tournament
    from app.models.user import User


class FantasyTeam(Base):
    """Фэнтези-команда пользователя в одном турнире.

    Сама команда — только название и владелец. Игроки выбираются
    на каждый тур отдельно (FantasyLineup), очки пишутся в журнал
    начислений (FantasyPointsEntry).
    """

    __tablename__ = "fantasy_teams"
    __table_args__ = (
        # В одном турнире у пользователя одна фэнтези-команда.
        UniqueConstraint("user_id", "tournament_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Удалили аккаунт — его фэнтези-команды удаляются вместе с ним.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    tournament_id: Mapped[int] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50))

    user: Mapped["User"] = relationship()
    tournament: Mapped["Tournament"] = relationship()
