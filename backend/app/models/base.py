from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Правило, по которому называются ограничения в базе: внешние ключи,
# уникальность, проверки, индексы. Без него Postgres придумывает имена
# сам, и потом Alembic не сможет найти ограничение, чтобы его удалить
# или поменять. Например, внешний ключ из teams на tournaments будет
# называться fk_teams_tournament_id_tournaments.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Базовый класс для всех моделей. От него наследуются таблицы."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    """Добавляет таблице поле created_at: когда запись появилась в базе."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
