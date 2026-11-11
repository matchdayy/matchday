from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.routers import tournaments

app = FastAPI(title="Матчдей API", version="0.1.0")
app.include_router(tournaments.router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Проверка, что сервер поднялся. Базу не трогает."""
    return {"status": "ok"}


@app.get("/api/health/db")
async def health_db(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Проверка, что сервер видит базу данных."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
