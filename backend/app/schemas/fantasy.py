"""Схемы ответов ручек туров и фэнтези-лиги."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Round(BaseModel):
    """Тур турнира."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    tournament_id: int
    number: int
    title: str
    """Как показывать тур: «Тур 1», «Полуфинал»."""
    deadline: datetime
    """До этого момента можно менять фэнтези-составы."""
    closed_at: datetime | None
    """Тур закрыт администратором, очки зафиксированы. Пусто — тур открыт."""


class FantasyRules(BaseModel):
    """Правила фэнтези-лиги. Числа берутся из app/services/fantasy/rules.py."""

    squad_size: int
    budget: int
    """Наибольшая сумма стоимостей игроков в одном составе."""
    max_per_team: int
    """Сколько игроков одной реальной команды можно взять в состав."""
    points: dict[str, int]
    """Очки за каждую причину начисления: goal, assist, played и так далее."""
