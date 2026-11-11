"""Команды для обслуживания сервера.

Первого администратора больше некому назначить, поэтому он создаётся
командой, а не через сайт:

    docker compose exec backend python -m app.cli create-admin \\
        --email admin@example.com --name "Администратор"

Пароль команда спрашивает в терминале и на экран не выводит. В аргументы
его не передаём: они остаются в истории команд.
"""

import argparse
import asyncio
import sys
from datetime import UTC, datetime
from getpass import getpass

from sqlalchemy import select

from app.auth import MAX_PASSWORD_BYTES, hash_password
from app.database import async_session, engine
from app.models import User, UserRole

MIN_PASSWORD_LENGTH = 8
MAX_DISPLAY_NAME_LENGTH = 50  # как у users.display_name


class CliError(Exception):
    """Ошибка, о которой достаточно написать одну строку, без трассировки."""


def ask_password() -> str:
    """Спрашивает пароль дважды и проверяет длину."""
    password = getpass("Пароль: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise CliError(f"Пароль короче {MIN_PASSWORD_LENGTH} символов")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise CliError(f"Пароль длиннее {MAX_PASSWORD_BYTES} байт")
    if getpass("Пароль ещё раз: ") != password:
        raise CliError("Пароли не совпадают")
    return password


async def create_admin(*, email: str, display_name: str, password: str) -> User:
    """Создаёт администратора. Согласие на обработку ПД — текущим временем."""
    email = email.strip().lower()
    async with async_session() as db:
        existing = await db.scalar(select(User).where(User.email == email))
        if existing is not None:
            raise CliError(f"Пользователь {email} уже есть")
        user = User(
            email=email,
            display_name=display_name,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            # Администратор заводит аккаунт сам и сам же соглашается.
            pd_consent_at=datetime.now(tz=UTC),
        )
        db.add(user)
        await db.commit()
    return user


async def _create_admin_once(*, email: str, display_name: str, password: str) -> User:
    try:
        return await create_admin(
            email=email, display_name=display_name, password=password
        )
    finally:
        # Соединения пула привязаны к циклу asyncio.run: закрываем их,
        # пока цикл жив, иначе asyncpg ругается при выходе.
        await engine.dispose()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    admin = commands.add_parser("create-admin", help="создать администратора")
    admin.add_argument("--email", required=True, help="почта для входа")
    admin.add_argument("--name", required=True, help="имя, которое видно на сайте")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    try:
        if not 0 < len(args.name.strip()) <= MAX_DISPLAY_NAME_LENGTH:
            raise CliError(f"Имя — от 1 до {MAX_DISPLAY_NAME_LENGTH} символов")
        password = ask_password()
        user = asyncio.run(
            _create_admin_once(
                email=args.email, display_name=args.name.strip(), password=password
            )
        )
    except CliError as error:
        sys.exit(f"Ошибка: {error}")
    print(f"Администратор {user.email} создан, id {user.id}")


if __name__ == "__main__":
    main()
