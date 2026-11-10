"""Настройка Alembic: откуда брать адрес базы и описание таблиц.

Этот файл Alembic запускает перед каждой командой (upgrade, downgrade,
revision). Сам по себе он ничего в базе не меняет.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.config import settings

# Импорт пакета app.models подтягивает все модели. Без него Base.metadata
# окажется пустым, и autogenerate решит, что таблиц в коде нет.
from app.models import Base

config = context.config

# Адрес базы тот же, что у приложения: из переменной APP_DATABASE_URL.
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Описание всех таблиц из кода. По нему autogenerate понимает,
# чем модели отличаются от того, что уже есть в базе.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Режим без подключения к базе: печатает SQL вместо выполнения.

    Запускается так: alembic upgrade head --sql
    """
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Подключаемся к базе через asyncpg, как и само приложение."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
