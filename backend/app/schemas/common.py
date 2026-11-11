"""Общие схемы ответов, которые встречаются в нескольких ручках.

Названия и поля совпадают с типами из контракта API (frontend/src/api/types.ts),
чтобы в Swagger и на фронтенде объекты назывались одинаково.
"""

from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict

from app.models import Match, MatchStatus
from app.services.score import Score, displayed_score

# Score — это dataclass из app.services.score. Pydantic умеет отдавать
# dataclass как обычную схему, поэтому второй класс для счёта не нужен.
__all__ = ["MatchShort", "PlayerShort", "Score", "TeamShort"]


class TeamShort(BaseModel):
    """Команда в краткой форме: в таблице, в карточке матча, у игрока."""

    # from_attributes: схему можно собрать прямо из модели SQLAlchemy,
    # TeamShort.model_validate(team).
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    logo_url: str | None


class PlayerShort(BaseModel):
    """Игрок в краткой форме: в составе, в событии матча, в списке бомбардиров."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    number: int | None
    position: str | None


class MatchShort(BaseModel):
    """Матч в списке: команды, время, статус и счёт."""

    id: int
    starts_at: datetime
    venue: str | None
    status: MatchStatus
    home_team: TeamShort
    away_team: TeamShort
    score: Score | None
    """Нет у запланированных и отменённых матчей."""

    @classmethod
    def from_model(cls, match: Match) -> Self:
        """Собирает ответ из матча с загруженными командами, событиями и игроками событий."""
        return cls(
            id=match.id,
            starts_at=match.starts_at,
            venue=match.venue,
            status=match.status,
            home_team=TeamShort.model_validate(match.home_team),
            away_team=TeamShort.model_validate(match.away_team),
            score=displayed_score(match=match),
        )
