"""Проверка фэнтези-состава перед сохранением.

Функция ничего не знает о базе: ручка загружает игроков, о которых
спросил участник, и передаёт их сюда как LineupCandidate.

Ошибки бывают двух видов, и ручка отвечает на них по-разному:
- дедлайн тура прошёл — 409: состав нормальный, просто менять уже поздно;
- состав нарушает правила — 422 со списком всех ошибок сразу, чтобы
  участник исправил всё за один раз, а не по одной ошибке.

Если дедлайн прошёл, остальные правила не проверяются: исправлять
состав всё равно бессмысленно.
"""

import enum
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from app.services.fantasy.rules import RULES


class LineupErrorKind(enum.StrEnum):
    """Вид ошибки: от него зависит код ответа ручки."""

    DEADLINE_PASSED = "deadline_passed"  # 409
    INVALID_LINEUP = "invalid_lineup"  # 422


@dataclass(frozen=True)
class LineupCandidate:
    """Игрок, которого участник хочет взять в состав."""

    id: int
    """Id игрока."""
    full_name: str
    """Имя игрока — для текста ошибки."""
    team_id: int
    """Id реальной команды игрока."""
    team_name: str
    """Название реальной команды — для текста ошибки."""
    price: int
    """Стоимость игрока."""
    in_tournament: bool
    """Играет ли игрок в турнире, к которому относится тур."""


@dataclass(frozen=True)
class LineupCheck:
    """Результат проверки состава."""

    kind: LineupErrorKind | None
    """Вид ошибки; None — состав можно сохранять."""
    errors: tuple[str, ...]
    """Понятные сообщения для участника, в порядке проверки правил."""
    total_price: int
    """Сумма стоимостей игроков турнира, выбранных в состав (без повторов)."""

    @property
    def ok(self) -> bool:
        return self.kind is None


def validate_lineup(
    *,
    player_ids: Sequence[int],
    candidates: Mapping[int, LineupCandidate],
    now: datetime,
    deadline: datetime,
) -> LineupCheck:
    """Проверяет состав по правилам из rules.py.

    candidates — игроки по id; если id из player_ids там нет, игрок
    считается не из турнира. now и deadline должны быть с часовым поясом.
    """
    if now >= deadline:
        return LineupCheck(
            kind=LineupErrorKind.DEADLINE_PASSED,
            errors=("Дедлайн тура прошёл, состав на этот тур больше не меняется.",),
            total_price=0,
        )

    # Повторы и чужие игроки — отдельные ошибки. Бюджет и лимит на команду
    # считаем по каждому игроку турнира один раз, чтобы повтор не давал
    # вторую, запутывающую ошибку про бюджет.
    unique_ids = list(dict.fromkeys(player_ids))
    squad = [
        candidates[player_id]
        for player_id in unique_ids
        if player_id in candidates and candidates[player_id].in_tournament
    ]
    total_price = sum(player.price for player in squad)

    errors = [
        *_size_errors(player_ids=player_ids),
        *_duplicate_errors(player_ids=player_ids, candidates=candidates),
        *_tournament_errors(player_ids=unique_ids, candidates=candidates),
        *_budget_errors(total_price=total_price),
        *_team_limit_errors(squad=squad),
    ]
    return LineupCheck(
        kind=LineupErrorKind.INVALID_LINEUP if errors else None,
        errors=tuple(errors),
        total_price=total_price,
    )


def _size_errors(*, player_ids: Sequence[int]) -> list[str]:
    if len(player_ids) == RULES.squad_size:
        return []
    return [
        f"В составе должно быть {_players(RULES.squad_size)}, "
        f"а выбрано {len(player_ids)}."
    ]


def _duplicate_errors(
    *, player_ids: Sequence[int], candidates: Mapping[int, LineupCandidate]
) -> list[str]:
    counts = Counter(player_ids)
    return [
        f"{_player_label(player_id=player_id, candidates=candidates)} "
        "выбран в состав несколько раз."
        for player_id, count in counts.items()
        if count > 1
    ]


def _tournament_errors(
    *, player_ids: Sequence[int], candidates: Mapping[int, LineupCandidate]
) -> list[str]:
    return [
        f"{_player_label(player_id=player_id, candidates=candidates)} "
        "не играет в этом турнире."
        for player_id in player_ids
        if player_id not in candidates or not candidates[player_id].in_tournament
    ]


def _budget_errors(*, total_price: int) -> list[str]:
    if total_price <= RULES.budget:
        return []
    return [f"Состав стоит {total_price}, а бюджет {RULES.budget}."]


def _team_limit_errors(*, squad: Sequence[LineupCandidate]) -> list[str]:
    per_team = Counter(player.team_id for player in squad)
    team_names = {player.team_id: player.team_name for player in squad}
    return [
        f"Из команды «{team_names[team_id]}» (id {team_id}) выбрано "
        f"{_players(count)}, а можно не больше {RULES.max_per_team}."
        for team_id, count in sorted(per_team.items())
        if count > RULES.max_per_team
    ]


def _player_label(*, player_id: int, candidates: Mapping[int, LineupCandidate]) -> str:
    candidate = candidates.get(player_id)
    if candidate is None:
        return f"Игрок с id {player_id}"
    return candidate.full_name


def _players(count: int) -> str:
    """«1 игрок», «3 игрока», «5 игроков»."""
    if count % 10 == 1 and count % 100 != 11:
        word = "игрок"
    elif count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        word = "игрока"
    else:
        word = "игроков"
    return f"{count} {word}"
