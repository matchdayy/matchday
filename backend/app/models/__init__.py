"""Все таблицы базы данных.

Каждая модель импортируется здесь. Alembic смотрит на Base.metadata,
а модель попадает туда, только когда её файл импортирован. Добавили новую
модель — допишите её в этот список.
"""

from app.models.base import Base
from app.models.fantasy_league import FantasyLeague, fantasy_league_members
from app.models.fantasy_lineup import FantasyLineup, fantasy_lineup_players
from app.models.fantasy_points import FantasyPointsEntry, FantasyPointsReason
from app.models.fantasy_team import FantasyTeam
from app.models.match import Match, MatchStatus
from app.models.match_event import MatchEvent, MatchEventType
from app.models.match_status_change import MatchStatusChange
from app.models.mvp_vote import MvpVote
from app.models.player import Player
from app.models.round import Round
from app.models.team import Team
from app.models.tournament import Tournament
from app.models.user import User, UserRole

__all__ = [
    "Base",
    "FantasyLeague",
    "FantasyLineup",
    "FantasyPointsEntry",
    "FantasyPointsReason",
    "FantasyTeam",
    "Match",
    "MatchEvent",
    "MatchEventType",
    "MatchStatus",
    "MatchStatusChange",
    "MvpVote",
    "Player",
    "Round",
    "Team",
    "Tournament",
    "User",
    "UserRole",
    "fantasy_league_members",
    "fantasy_lineup_players",
]
