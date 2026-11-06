"""Все таблицы базы данных.

Каждая модель импортируется здесь. Alembic смотрит на Base.metadata,
а модель попадает туда, только когда её файл импортирован. Добавили новую
модель — допишите её в этот список.
"""

from app.models.base import Base
from app.models.match import Match, MatchStatus
from app.models.match_event import MatchEvent, MatchEventType
from app.models.player import Player
from app.models.team import Team
from app.models.tournament import Tournament

__all__ = [
    "Base",
    "Match",
    "MatchEvent",
    "MatchEventType",
    "MatchStatus",
    "Player",
    "Team",
    "Tournament",
]
