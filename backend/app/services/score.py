"""Счёт матча по ленте событий.

Счёт нигде не хранится: его каждый раз считают по событиям «гол».
Так он не может разойтись с тем, что записано в ленте матча.

Гол идёт команде забившего. Автогол (is_own_goal) — команде соперника.

Чтобы посчитать счёт, у матча должны быть загружены события, а у каждого
события — игрок: команду забившего мы узнаём по player.team_id.
В асинхронной сессии ленивой подгрузки нет, поэтому загружайте всё
сразу в запросе:

    from sqlalchemy import select
    from app.services.score import EVENTS_WITH_PLAYERS, match_score

    match = await db.scalar(
        select(Match).where(Match.id == match_id).options(EVENTS_WITH_PLAYERS)
    )
    score = match_score(match=match)

Если забыть про загрузку, SQLAlchemy упадёт с ошибкой MissingGreenlet
при обращении к match.events.
"""

from dataclasses import dataclass

from sqlalchemy.orm import selectinload

from app.models import Match, MatchEvent, MatchEventType, MatchStatus

# Готовая настройка загрузки для запроса матча: события и игрок каждого
# события. Передаётся в .options(...) — см. пример в начале файла.
EVENTS_WITH_PLAYERS = selectinload(Match.events).selectinload(MatchEvent.player)


@dataclass(frozen=True)
class Score:
    """Счёт матча."""

    home: int
    """Голы хозяев."""
    away: int
    """Голы гостей."""


def match_score(*, match: Match) -> Score:
    """Считает счёт матча по голам из ленты событий."""
    home = 0
    away = 0
    for event in match.events:
        if event.type != MatchEventType.GOAL:
            continue
        scoring_team_id = _scoring_team_id(match=match, event=event)
        if scoring_team_id == match.home_team_id:
            home += 1
        elif scoring_team_id == match.away_team_id:
            away += 1
    return Score(home=home, away=away)


def displayed_score(*, match: Match) -> Score | None:
    """Счёт для ответа API: у запланированных и отменённых матчей его нет."""
    if match.status in (MatchStatus.SCHEDULED, MatchStatus.CANCELLED):
        return None
    return match_score(match=match)


def _scoring_team_id(*, match: Match, event: MatchEvent) -> int:
    """Команда, которой засчитан гол."""
    player_team_id = event.player.team_id
    if not event.is_own_goal:
        return player_team_id
    if player_team_id == match.home_team_id:
        return match.away_team_id
    if player_team_id == match.away_team_id:
        return match.home_team_id
    # Игрок не из этого матча — такого быть не должно, ручка добавления
    # события это проверяет. Гол просто не попадёт ни одной из команд.
    return player_team_id
