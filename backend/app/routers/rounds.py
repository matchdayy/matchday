"""Закрытие тура и правила фэнтези-лиги.

Расчёт очков живёт в app/services/fantasy, ручки только переводят
его ошибки в ответы API.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_role
from app.database import get_db
from app.models import User, UserRole
from app.schemas.fantasy import FantasyRules, Round
from app.services.fantasy.close_round import (
    RoundNotFoundError,
    RoundNotReadyError,
    close_round,
)
from app.services.fantasy.rules import rules_as_dict

router = APIRouter()


@router.post("/api/rounds/{round_id}/close", tags=["Туры"])
async def close_round_endpoint(
    round_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_role(UserRole.ADMIN)),
) -> Round:
    """Закрывает тур и начисляет фэнтези-очки. Только для администратора.

    Повторное закрытие отвечает 200 и тем же туром, очки не пересчитываются.
    Если в туре есть незавершённые матчи — 409.
    """
    try:
        closed = await close_round(db=db, round_id=round_id)
    except RoundNotFoundError:
        raise HTTPException(status_code=404, detail="Тур не найден")
    except RoundNotReadyError as error:
        raise HTTPException(status_code=409, detail=str(error))
    return Round.model_validate(closed)


@router.get("/api/fantasy/rules", tags=["Фэнтези"])
async def get_fantasy_rules() -> FantasyRules:
    """Правила фэнтези-лиги: размер состава, бюджет и очки за события."""
    return FantasyRules.model_validate(rules_as_dict())
