"""Ручки турниров: список, карточка, таблица, матчи, бомбардиры и ассистенты.

Ручки только достают данные из базы и собирают ответ. Всё, что считается
(счёт, таблица, статистика), живёт в app/services.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import models
from app.database import get_db
from app.schemas.common import MatchShort
from app.schemas.tournament import TableRow, TopAssistant, TopScorer, Tournament
from app.services.player_stats import load_players, load_tournament_stats, rank_players
from app.services.score import EVENTS_WITH_PLAYERS
from app.services.standings import build_table
from app.services.tournament_status import today_utc

router = APIRouter(prefix="/api/tournaments", tags=["Турниры"])


async def get_tournament_or_404(
    *, db: AsyncSession, tournament_id: int
) -> models.Tournament:
    tournament = await db.get(models.Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Турнир не найден")
    return tournament


@router.get("")
async def list_tournaments(db: AsyncSession = Depends(get_db)) -> list[Tournament]:
    """Все турниры: сначала те, что начинаются позже."""
    tournaments = await db.scalars(
        select(models.Tournament).order_by(
            models.Tournament.start_date.desc(), models.Tournament.id
        )
    )
    today = today_utc()
    return [
        Tournament.from_model(tournament, today=today) for tournament in tournaments
    ]


@router.get("/{tournament_id}")
async def get_tournament(
    tournament_id: int, db: AsyncSession = Depends(get_db)
) -> Tournament:
    """Карточка турнира."""
    tournament = await get_tournament_or_404(db=db, tournament_id=tournament_id)
    return Tournament.from_model(tournament, today=today_utc())


@router.get("/{tournament_id}/table")
async def get_table(
    tournament_id: int, db: AsyncSession = Depends(get_db)
) -> list[TableRow]:
    """Турнирная таблица, уже отсортированная. Порядок мест — в app/services/standings.py."""
    await get_tournament_or_404(db=db, tournament_id=tournament_id)
    teams = await db.scalars(
        select(models.Team).where(models.Team.tournament_id == tournament_id)
    )
    matches = await db.scalars(
        select(models.Match)
        .where(models.Match.tournament_id == tournament_id)
        .options(EVENTS_WITH_PLAYERS)
    )
    table = build_table(teams=list(teams), matches=list(matches))
    return [TableRow.model_validate(row) for row in table]


@router.get("/{tournament_id}/matches")
async def get_matches(
    tournament_id: int, db: AsyncSession = Depends(get_db)
) -> list[MatchShort]:
    """Матчи турнира по времени начала, со счётом."""
    await get_tournament_or_404(db=db, tournament_id=tournament_id)
    matches = await db.scalars(
        select(models.Match)
        .where(models.Match.tournament_id == tournament_id)
        .order_by(models.Match.starts_at, models.Match.id)
        .options(
            selectinload(models.Match.home_team),
            selectinload(models.Match.away_team),
            EVENTS_WITH_PLAYERS,
        )
    )
    return [MatchShort.from_model(match) for match in matches]


@router.get("/{tournament_id}/scorers")
async def get_scorers(
    tournament_id: int, db: AsyncSession = Depends(get_db)
) -> list[TopScorer]:
    """Бомбардиры турнира: по голам, автоголы не считаются."""
    await get_tournament_or_404(db=db, tournament_id=tournament_id)
    stats = await load_tournament_stats(db=db, tournament_id=tournament_id)
    players = await load_players(db=db, player_ids=stats.keys())
    goals = {player_id: player_stats.goals for player_id, player_stats in stats.items()}
    return [
        TopScorer.from_total(row) for row in rank_players(totals=goals, players=players)
    ]


@router.get("/{tournament_id}/assists")
async def get_assists(
    tournament_id: int, db: AsyncSession = Depends(get_db)
) -> list[TopAssistant]:
    """Ассистенты турнира: по голевым передачам."""
    await get_tournament_or_404(db=db, tournament_id=tournament_id)
    stats = await load_tournament_stats(db=db, tournament_id=tournament_id)
    players = await load_players(db=db, player_ids=stats.keys())
    assists = {
        player_id: player_stats.assists for player_id, player_stats in stats.items()
    }
    return [
        TopAssistant.from_total(row)
        for row in rank_players(totals=assists, players=players)
    ]
