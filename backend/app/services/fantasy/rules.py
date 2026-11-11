"""Правила фэнтези-лиги: размер состава, бюджет и очки за события.

Это единственное место, где живут числа фэнтези. Проверка состава,
начисление очков и ручка GET /api/fantasy/rules берут их отсюда, поэтому
правило меняется в одной строке и сразу везде.

Бюджет — это только ограничение на сумму стоимостей игроков в одном
составе, чтобы нельзя было собрать всех лучших игроков турнира сразу.
Это не деньги и не внутриигровая валюта: бюджет нельзя заработать,
накопить, потратить или перенести в следующий тур, у каждого состава
он один и тот же.
"""

import enum
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any


class PointsReason(enum.StrEnum):
    """За что начислены очки. Значения совпадают с полем reason в API."""

    GOAL = "goal"  # гол, не автогол
    ASSIST = "assist"  # голевая передача
    PLAYED = "played"  # команда игрока сыграла завершённый матч тура
    YELLOW_CARD = "yellow_card"  # жёлтая карточка
    RED_CARD = "red_card"  # красная карточка
    OWN_GOAL = "own_goal"  # гол в свои ворота


SQUAD_SIZE = 5
BUDGET = 50
MAX_PER_TEAM = 2

# MappingProxyType — словарь только для чтения: случайно поменять очки
# из другого модуля не получится.
POINTS: MappingProxyType[PointsReason, int] = MappingProxyType(
    {
        PointsReason.GOAL: 4,
        PointsReason.ASSIST: 3,
        PointsReason.PLAYED: 1,
        PointsReason.YELLOW_CARD: -1,
        PointsReason.RED_CARD: -3,
        PointsReason.OWN_GOAL: -2,
    }
)


@dataclass(frozen=True)
class FantasyRules:
    """Все правила фэнтези одним объектом."""

    squad_size: int
    """Сколько игроков в составе."""
    budget: int
    """Наибольшая сумма стоимостей игроков в одном составе."""
    max_per_team: int
    """Сколько игроков одной реальной команды можно взять в состав."""
    points: MappingProxyType[PointsReason, int]
    """Очки за каждую причину начисления."""


RULES = FantasyRules(
    squad_size=SQUAD_SIZE,
    budget=BUDGET,
    max_per_team=MAX_PER_TEAM,
    points=POINTS,
)


def rules_as_dict() -> dict[str, Any]:
    """Правила в виде ответа ручки GET /api/fantasy/rules."""
    return {
        "squad_size": RULES.squad_size,
        "budget": RULES.budget,
        "max_per_team": RULES.max_per_team,
        "points": {reason.value: points for reason, points in RULES.points.items()},
    }
