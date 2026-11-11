"""Сборка матчей и событий в памяти, без базы данных.

Модели SQLAlchemy можно создавать как обычные объекты Python: пока их
не добавили в сессию, база не нужна. Этим пользуются юнит-тесты счёта,
таблицы и статистики.
"""

from app.models import Match, MatchEvent, MatchEventType, MatchStatus, Player

HOME_TEAM_ID = 1
AWAY_TEAM_ID = 2


def make_player(*, player_id: int, team_id: int) -> Player:
    return Player(id=player_id, team_id=team_id, full_name=f"Игрок {player_id}")


def goal(
    *, player: Player, assist: Player | None = None, own_goal: bool = False
) -> MatchEvent:
    return MatchEvent(
        type=MatchEventType.GOAL,
        minute=10,
        player=player,
        player_id=player.id,
        assist_player_id=assist.id if assist else None,
        is_own_goal=own_goal,
    )


def card(*, player: Player, event_type: MatchEventType) -> MatchEvent:
    return MatchEvent(
        type=event_type,
        minute=20,
        player=player,
        player_id=player.id,
        assist_player_id=None,
        is_own_goal=False,
    )


def make_match(
    *,
    events: list[MatchEvent],
    home_team_id: int = HOME_TEAM_ID,
    away_team_id: int = AWAY_TEAM_ID,
    status: MatchStatus = MatchStatus.FINISHED,
) -> Match:
    return Match(
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        status=status,
        events=events,
    )


def finished_match(
    *, home_team_id: int, away_team_id: int, home_goals: int, away_goals: int
) -> Match:
    """Завершённый матч с заданным счётом: голы забивают по одному игроку от команды."""
    home_player = make_player(player_id=home_team_id * 100, team_id=home_team_id)
    away_player = make_player(player_id=away_team_id * 100, team_id=away_team_id)
    events = [goal(player=home_player) for _ in range(home_goals)]
    events += [goal(player=away_player) for _ in range(away_goals)]
    return make_match(
        events=events, home_team_id=home_team_id, away_team_id=away_team_id
    )
