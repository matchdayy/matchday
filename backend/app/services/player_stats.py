"""Статистика игроков по ленте событий: голы, передачи, карточки.

Как и счёт, статистика нигде не хранится, а считается по событиям матчей.

- Гол засчитывается забившему. Автогол забившему не засчитывается:
  в его статистике это не гол, хотя в счёте матча он идёт сопернику.
- Передача засчитывается игроку из поля assist_player_id у гола.
- Карточки считаются по событиям yellow_card и red_card.

Учитываются события всех матчей, в том числе идущих: статистика меняется
сразу, как оператор добавил гол. Игрок состоит в одной команде одного
турнира, поэтому все его события относятся к одному турниру.

Для ручки игрока (/api/players/{id}):

    stats = await load_player_stats(db=db, player_id=player.id)

Для бомбардиров и ассистентов турнира — load_tournament_stats и rank_players.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Match, MatchEvent, MatchEventType, Player


@dataclass
class PlayerStats:
    """Статистика одного игрока."""

    goals: int = 0
    """Голы, без автоголов."""
    assists: int = 0
    """Голевые передачи."""
    yellow_cards: int = 0
    """Жёлтые карточки."""
    red_cards: int = 0
    """Красные карточки."""


@dataclass(frozen=True)
class PlayerTotal:
    """Игрок и одно его число: голы или передачи. Строка списка лидеров."""

    player: Player
    """Игрок с загруженной командой."""
    total: int
    """Сколько голов или передач."""


def stats_by_player(*, events: Iterable[MatchEvent]) -> dict[int, PlayerStats]:
    """Считает статистику всех игроков из списка событий. Ключ — id игрока."""
    stats: defaultdict[int, PlayerStats] = defaultdict(PlayerStats)
    for event in events:
        _add_event(stats=stats, event=event)
    return dict(stats)


def _add_event(*, stats: defaultdict[int, PlayerStats], event: MatchEvent) -> None:
    if event.type == MatchEventType.GOAL:
        if not event.is_own_goal:
            stats[event.player_id].goals += 1
        if event.assist_player_id is not None:
            stats[event.assist_player_id].assists += 1
    elif event.type == MatchEventType.YELLOW_CARD:
        stats[event.player_id].yellow_cards += 1
    elif event.type == MatchEventType.RED_CARD:
        stats[event.player_id].red_cards += 1


def rank_players(
    *, totals: dict[int, int], players: dict[int, Player]
) -> list[PlayerTotal]:
    """Список лидеров: только ненулевые, по убыванию, при равенстве — по имени."""
    ranked = [
        PlayerTotal(player=players[player_id], total=total)
        for player_id, total in totals.items()
        if total > 0
    ]
    ranked.sort(key=lambda row: (-row.total, row.player.full_name))
    return ranked


async def load_player_stats(*, db: AsyncSession, player_id: int) -> PlayerStats:
    """Статистика одного игрока из базы. У игрока без событий — все нули."""
    events = await db.scalars(
        select(MatchEvent).where(
            or_(
                MatchEvent.player_id == player_id,
                MatchEvent.assist_player_id == player_id,
            )
        )
    )
    return stats_by_player(events=events).get(player_id, PlayerStats())


async def load_tournament_stats(
    *, db: AsyncSession, tournament_id: int
) -> dict[int, PlayerStats]:
    """Статистика всех игроков турнира, у которых есть хоть одно событие."""
    events = await db.scalars(
        select(MatchEvent).join(Match).where(Match.tournament_id == tournament_id)
    )
    return stats_by_player(events=events)


async def load_players(
    *, db: AsyncSession, player_ids: Iterable[int]
) -> dict[int, Player]:
    """Игроки с командами по списку id. Ключ — id игрока."""
    players = await db.scalars(
        select(Player)
        .where(Player.id.in_(list(player_ids)))
        .options(selectinload(Player.team))
    )
    return {player.id: player for player in players}
