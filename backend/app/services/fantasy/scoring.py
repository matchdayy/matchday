"""Начисление фэнтези-очков за тур по ленте событий матчей.

Как и счёт матча, очки берутся из событий: голов, передач и карточек.
Но в отличие от счёта они считаются один раз — при закрытии тура —
и записываются в журнал. После этого правка ленты завершённого матча
меняет счёт и таблицу, но не фэнтези-очки.

Правила (числа — в rules.POINTS):
- считаются только завершённые матчи тура; отменённый матч не даёт ничего;
- гол — забившему, автогол — минус забившему в свои ворота;
- передача — игроку из assist_player_id у обычного гола;
- жёлтая и красная карточки — минус получившему;
- «сыграл» — каждому игроку состава, чья команда провела завершённый
  матч тура, по одной строке на матч. Протоколов с заявкой на матч у нас
  нет, поэтому «сыграл» считается по команде, а не по выходу на поле.

Функции здесь чистые: на одних и тех же данных они дают один и тот же
список строк в одном и том же порядке. Поэтому журнал стабилен, а
результат легко проверить тестом.
"""

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

from app.models import MatchEventType, MatchStatus
from app.services.fantasy.rules import POINTS, PointsReason

# Матчи в этих статусах больше не изменятся, и тур с ними можно закрыть.
_CLOSED_STATUSES = (MatchStatus.FINISHED, MatchStatus.CANCELLED)

_CARD_REASONS = {
    MatchEventType.YELLOW_CARD: PointsReason.YELLOW_CARD,
    MatchEventType.RED_CARD: PointsReason.RED_CARD,
}


@dataclass(frozen=True)
class RoundEvent:
    """Событие из ленты матча тура."""

    id: int
    """Id события — попадёт в журнал начислений."""
    type: str
    """Тип события: значение MatchEventType."""
    minute: int
    """Минута матча."""
    player_id: int
    """Кто забил или получил карточку."""
    player_team_id: int
    """Команда этого игрока."""
    assist_player_id: int | None
    """Кто отдал голевую передачу."""
    is_own_goal: bool
    """Гол в свои ворота."""


@dataclass(frozen=True)
class RoundMatch:
    """Матч тура с лентой событий."""

    id: int
    """Id матча."""
    status: str
    """Статус матча: значение MatchStatus."""
    home_team_id: int
    """Команда хозяев."""
    away_team_id: int
    """Команда гостей."""
    events: tuple[RoundEvent, ...]
    """Лента событий матча."""


@dataclass(frozen=True)
class TeamLineup:
    """Фэнтези-состав участника на тур."""

    fantasy_team_id: int
    """Id фэнтези-команды участника."""
    player_ids: tuple[int, ...]
    """Игроки состава."""
    player_team_ids: Mapping[int, int]
    """Реальная команда каждого игрока состава: id игрока → id команды."""


@dataclass(frozen=True)
class PastLineup:
    """Состав участника из одного из прошлых туров."""

    round_number: int
    """Номер тура, на который был прислан состав."""
    lineup: TeamLineup
    """Сам состав."""


@dataclass(frozen=True)
class PointsLine:
    """Одна строка журнала начислений."""

    fantasy_team_id: int
    """Чьей фэнтези-команде начислено."""
    player_id: int
    """За какого игрока."""
    match_id: int
    """В каком матче."""
    event_id: int | None
    """За какое событие; None — за «сыграл»."""
    minute: int | None
    """Минута события; None — за «сыграл»."""
    reason: PointsReason
    """За что."""
    points: int
    """Сколько очков, может быть отрицательным."""


@dataclass(frozen=True)
class _PlayerPoints:
    """Очки игрока в матче, пока без привязки к фэнтези-команде."""

    player_id: int
    match_id: int
    event_id: int | None
    minute: int | None
    reason: PointsReason


def can_close_round(matches: Sequence[RoundMatch]) -> list[str]:
    """Почему тур нельзя закрыть; пустой список — можно."""
    return [
        f"Матч {match.id} ещё не завершён и не отменён (статус: {match.status})."
        for match in sorted(matches, key=lambda match: match.id)
        if match.status not in _CLOSED_STATUSES
    ]


def resolve_lineups(
    *, submitted: Sequence[TeamLineup], previous: Sequence[PastLineup]
) -> list[TeamLineup]:
    """Составы, по которым считается тур.

    Кто прислал состав на тур — играет им. Кто не прислал — последним
    составом из прошлых туров. У кого нет ни того, ни другого, в тур
    не попадает и очков не получает. previous должен содержать только
    туры раньше текущего.
    """
    latest: dict[int, PastLineup] = {}
    for past in previous:
        team_id = past.lineup.fantasy_team_id
        if team_id not in latest or past.round_number > latest[team_id].round_number:
            latest[team_id] = past
    lineups = {team_id: past.lineup for team_id, past in latest.items()}
    lineups.update({lineup.fantasy_team_id: lineup for lineup in submitted})
    return [lineups[team_id] for team_id in sorted(lineups)]


def score_round(
    *, matches: Sequence[RoundMatch], lineups: Sequence[TeamLineup]
) -> list[PointsLine]:
    """Строки журнала начислений за тур для всех составов.

    Порядок строк: фэнтези-команда, матч, минута (строки «сыграл» —
    в конце матча), событие, игрок.
    """
    finished = [match for match in matches if match.status == MatchStatus.FINISHED]
    event_points = _event_points(matches=finished)
    lines = [
        line
        for lineup in lineups
        for line in _lineup_lines(
            lineup=lineup, matches=finished, event_points=event_points
        )
    ]
    lines.sort(key=_line_order)
    return lines


def _lineup_lines(
    *,
    lineup: TeamLineup,
    matches: Sequence[RoundMatch],
    event_points: Sequence[_PlayerPoints],
) -> list[PointsLine]:
    squad = set(lineup.player_ids)
    player_points = [
        *event_points,
        *_played_points(matches=matches, player_team_ids=lineup.player_team_ids),
    ]
    return [
        PointsLine(
            fantasy_team_id=lineup.fantasy_team_id,
            player_id=item.player_id,
            match_id=item.match_id,
            event_id=item.event_id,
            minute=item.minute,
            reason=item.reason,
            points=POINTS[item.reason],
        )
        for item in player_points
        if item.player_id in squad
    ]


def _event_points(*, matches: Iterable[RoundMatch]) -> list[_PlayerPoints]:
    return [
        _PlayerPoints(
            player_id=player_id,
            match_id=match.id,
            event_id=event.id,
            minute=event.minute,
            reason=reason,
        )
        for match in matches
        for event in match.events
        for player_id, reason in _event_reasons(event=event)
    ]


def _event_reasons(*, event: RoundEvent) -> list[tuple[int, PointsReason]]:
    """Кому и за что начисляются очки за одно событие."""
    if event.type == MatchEventType.GOAL:
        if event.is_own_goal:
            return [(event.player_id, PointsReason.OWN_GOAL)]
        reasons = [(event.player_id, PointsReason.GOAL)]
        if event.assist_player_id is not None:
            reasons.append((event.assist_player_id, PointsReason.ASSIST))
        return reasons
    if event.type in _CARD_REASONS:
        return [(event.player_id, _CARD_REASONS[MatchEventType(event.type)])]
    # Неизвестные типы событий очков не дают: новый тип в ленте
    # не должен ломать закрытие тура.
    return []


def _played_points(
    *, matches: Iterable[RoundMatch], player_team_ids: Mapping[int, int]
) -> list[_PlayerPoints]:
    return [
        _PlayerPoints(
            player_id=player_id,
            match_id=match.id,
            event_id=None,
            minute=None,
            reason=PointsReason.PLAYED,
        )
        for match in matches
        for player_id, team_id in player_team_ids.items()
        if team_id in (match.home_team_id, match.away_team_id)
    ]


def _line_order(line: PointsLine) -> tuple[int, int, bool, int, bool, int, int, str]:
    # None нельзя сравнивать с числами, поэтому сначала флаг «нет значения»:
    # строки «сыграл» без минуты и события уходят в конец своего матча.
    return (
        line.fantasy_team_id,
        line.match_id,
        line.minute is None,
        line.minute or 0,
        line.event_id is None,
        line.event_id or 0,
        line.player_id,
        line.reason,
    )
