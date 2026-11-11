"""Схемы ответов ручек /api/tournaments."""

from datetime import date
from typing import Self

from pydantic import BaseModel, ConfigDict

from app import models
from app.schemas.common import PlayerShort, TeamShort
from app.services.player_stats import PlayerTotal
from app.services.tournament_status import TournamentStatus, tournament_status


class Tournament(BaseModel):
    """Турнир со статусом, посчитанным по датам."""

    id: int
    name: str
    sport: str
    start_date: date
    end_date: date
    status: TournamentStatus

    @classmethod
    def from_model(cls, tournament: models.Tournament, *, today: date) -> Self:
        return cls(
            id=tournament.id,
            name=tournament.name,
            sport=tournament.sport,
            start_date=tournament.start_date,
            end_date=tournament.end_date,
            status=tournament_status(
                start_date=tournament.start_date,
                end_date=tournament.end_date,
                today=today,
            ),
        )


class TableRow(BaseModel):
    """Строка турнирной таблицы. Собирается из TeamStanding (app/services/standings.py)."""

    model_config = ConfigDict(from_attributes=True)

    position: int
    team: TeamShort
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_diff: int
    points: int


class TopScorer(BaseModel):
    """Строка списка бомбардиров."""

    player: PlayerShort
    team: TeamShort
    goals: int

    @classmethod
    def from_total(cls, row: PlayerTotal) -> Self:
        return cls(
            player=PlayerShort.model_validate(row.player),
            team=TeamShort.model_validate(row.player.team),
            goals=row.total,
        )


class TopAssistant(BaseModel):
    """Строка списка ассистентов."""

    player: PlayerShort
    team: TeamShort
    assists: int

    @classmethod
    def from_total(cls, row: PlayerTotal) -> Self:
        return cls(
            player=PlayerShort.model_validate(row.player),
            team=TeamShort.model_validate(row.player.team),
            assists=row.total,
        )
