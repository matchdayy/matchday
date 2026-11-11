"""Рейтинг фэнтези-команд турнира или лиги.

Рейтинг нигде не хранится: он считается по журналу начислений закрытых
туров. Команды без очков тоже есть в рейтинге, у них нули.

Порядок мест:
1. больше очков за все туры;
2. больше очков в последнем закрытом туре — у кого форма лучше сейчас;
3. меньший id фэнтези-команды, то есть кто раньше создал команду.
Места всегда идут 1..N без повторов, чтобы порядок не прыгал
между запросами.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class RatingEntry:
    """Очки фэнтези-команды за тур: строка журнала или их сумма."""

    fantasy_team_id: int
    """Чьи очки."""
    round_id: int
    """За какой тур."""
    points: int
    """Сколько очков."""


@dataclass(frozen=True)
class RatingRow:
    """Строка рейтинга."""

    position: int
    """Место, с 1."""
    fantasy_team_id: int
    """Фэнтези-команда."""
    points: int
    """Очки за все закрытые туры."""
    last_round_points: int
    """Очки за последний закрытый тур."""


def build_rating(
    *,
    team_ids: Iterable[int],
    entries: Iterable[RatingEntry],
    last_round_id: int | None,
) -> list[RatingRow]:
    """Расставляет фэнтези-команды по местам.

    team_ids — команды турнира или лиги; очки других команд из entries
    не учитываются. last_round_id — последний закрытый тур, None — закрытых
    туров ещё нет.
    """
    teams = set(team_ids)
    total: defaultdict[int, int] = defaultdict(int)
    last_round: defaultdict[int, int] = defaultdict(int)
    for entry in entries:
        if entry.fantasy_team_id not in teams:
            continue
        total[entry.fantasy_team_id] += entry.points
        if entry.round_id == last_round_id:
            last_round[entry.fantasy_team_id] += entry.points

    ordered = sorted(
        teams, key=lambda team_id: (-total[team_id], -last_round[team_id], team_id)
    )
    return [
        RatingRow(
            position=position,
            fantasy_team_id=team_id,
            points=total[team_id],
            last_round_points=last_round[team_id],
        )
        for position, team_id in enumerate(ordered, start=1)
    ]
