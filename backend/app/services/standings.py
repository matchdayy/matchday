"""Турнирная таблица по завершённым матчам.

Таблица нигде не хранится: она считается по счёту матчей, а счёт —
по ленте событий (см. app/services/score.py).

В таблицу идут только завершённые матчи. Идущий матч, матч на паузе,
запланированный и отменённый не учитываются: результат ещё не известен
или матча не было.

За победу 3 очка, за ничью 1, за поражение 0. Команды без сыгранных
матчей тоже есть в таблице, у них все нули.

Порядок мест — решение по ТЗ («очки, разница мячей и результаты личных
встреч»):
1. больше очков;
2. больше очков в личных встречах — считаются только матчи между
   командами, у которых очков поровну;
3. больше разница забитых и пропущенных;
4. больше забитых;
5. по названию команды по алфавиту — чтобы порядок не прыгал между
   запросами, когда всё остальное равно.

Личные встречи считаются один раз, без пересчёта внутри оставшихся
равных команд. Для студенческого турнира этого достаточно.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from app.models import Match, MatchStatus, Team
from app.services.score import Score, match_score

POINTS_FOR_WIN = 3
POINTS_FOR_DRAW = 1


@dataclass
class TeamStanding:
    """Строка турнирной таблицы."""

    team: Team
    """Команда."""
    played: int = 0
    """Сыграно матчей."""
    won: int = 0
    """Победы."""
    drawn: int = 0
    """Ничьи."""
    lost: int = 0
    """Поражения."""
    goals_for: int = 0
    """Забито."""
    goals_against: int = 0
    """Пропущено."""
    position: int = 0
    """Место в таблице, с 1. Проставляется после сортировки."""

    @property
    def goal_diff(self) -> int:
        return self.goals_for - self.goals_against

    @property
    def points(self) -> int:
        return self.won * POINTS_FOR_WIN + self.drawn * POINTS_FOR_DRAW


@dataclass(frozen=True)
class _Result:
    """Итог одного завершённого матча."""

    home_team_id: int
    away_team_id: int
    score: Score


def build_table(
    *, teams: Sequence[Team], matches: Sequence[Match]
) -> list[TeamStanding]:
    """Считает таблицу турнира и расставляет команды по местам.

    У матчей должны быть загружены события с игроками (см. score.py).
    """
    results = [
        _Result(
            home_team_id=match.home_team_id,
            away_team_id=match.away_team_id,
            score=match_score(match=match),
        )
        for match in matches
        if match.status == MatchStatus.FINISHED
    ]
    standings = {team.id: TeamStanding(team=team) for team in teams}
    for result in results:
        home = standings[result.home_team_id]
        away = standings[result.away_team_id]
        _add_result(standing=home, scored=result.score.home, conceded=result.score.away)
        _add_result(standing=away, scored=result.score.away, conceded=result.score.home)

    head_to_head = _head_to_head_points(standings=standings, results=results)
    table = sorted(
        standings.values(),
        key=lambda row: (
            -row.points,
            -head_to_head[row.team.id],
            -row.goal_diff,
            -row.goals_for,
            row.team.name,
        ),
    )
    for position, row in enumerate(table, start=1):
        row.position = position
    return table


def _add_result(*, standing: TeamStanding, scored: int, conceded: int) -> None:
    standing.played += 1
    standing.goals_for += scored
    standing.goals_against += conceded
    if scored > conceded:
        standing.won += 1
    elif scored == conceded:
        standing.drawn += 1
    else:
        standing.lost += 1


def _head_to_head_points(
    *, standings: dict[int, TeamStanding], results: list[_Result]
) -> dict[int, int]:
    """Очки каждой команды в матчах против команд с тем же числом очков."""
    points = {team_id: 0 for team_id in standings}
    for result in results:
        home = standings[result.home_team_id]
        away = standings[result.away_team_id]
        if home.points != away.points:
            continue
        points[home.team.id] += _match_points(
            scored=result.score.home, conceded=result.score.away
        )
        points[away.team.id] += _match_points(
            scored=result.score.away, conceded=result.score.home
        )
    return points


def _match_points(*, scored: int, conceded: int) -> int:
    if scored > conceded:
        return POINTS_FOR_WIN
    if scored == conceded:
        return POINTS_FOR_DRAW
    return 0
