from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MvpVote(TimestampMixin, Base):
    """Голос зрителя за лучшего игрока матча.

    Итоги не хранятся, а считаются по голосам. Что игрок из одной
    из двух команд матча и что голосование ещё открыто, проверяет ручка.
    """

    __tablename__ = "mvp_votes"
    __table_args__ = (
        # Один голос на матч. Проверка в базе, а не только в ручке:
        # два одновременных запроса не проскочат.
        UniqueConstraint("match_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("matches.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id", ondelete="CASCADE"), index=True
    )
