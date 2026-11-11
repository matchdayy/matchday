"""Основа входа и прав доступа: хеш пароля, токен, зависимости FastAPI.

Ручек регистрации и входа здесь нет, только кирпичики для них:

- hash_password / verify_password — пароль хранится только в виде хеша bcrypt;
- create_access_token — токен, который фронтенд присылает в заголовке
  Authorization: Bearer <токен>;
- get_current_user, get_optional_user, require_role — зависимости для ручек.

Закрыть ручку от гостей и зрителей:

    @router.post("/api/matches/{match_id}/events")
    async def add_event(
        ...,
        user: User = Depends(require_role(UserRole.OPERATOR)),
    ): ...

Администратор проходит любую проверку роли: всё, что может оператор,
может и он.
"""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User, UserRole

TOKEN_ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=7)
# bcrypt смотрит только на первые 72 байта пароля. Библиотека не обрезает
# длинный пароль молча, а падает, поэтому ограничение лучше проверить
# в ручке регистрации и вернуть 422 с понятным текстом. В UTF-8 русская
# буква занимает 2 байта: это 36 русских букв.
MAX_PASSWORD_BYTES = 72

# auto_error=False: без заголовка FastAPI не отвечает 403 сам, а отдаёт None.
# Тогда «нет токена» и «токен плохой» дают одинаковый ответ 401.
bearer_scheme = HTTPBearer(auto_error=False)


class AuthConfigError(RuntimeError):
    """Приложение настроено так, что выдавать и проверять токены нельзя."""


def hash_password(password: str) -> str:
    """Хеш пароля для хранения в users.password_hash. Соль внутри хеша."""
    password_bytes = password.encode()
    if len(password_bytes) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Пароль длиннее {MAX_PASSWORD_BYTES} байт")
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode()


def verify_password(*, password: str, password_hash: str) -> bool:
    """Совпадает ли пароль с сохранённым хешем."""
    password_bytes = password.encode()
    # Такой пароль не мог быть сохранён: hash_password его не примет.
    if len(password_bytes) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(password_bytes, password_hash.encode())


def create_access_token(*, user_id: int) -> str:
    """Токен входа на 7 дней. Внутри только id пользователя, роль — в базе."""
    now = datetime.now(tz=UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_LIFETIME}
    return jwt.encode(payload, _secret_key(), algorithm=TOKEN_ALGORITHM)


def _secret_key() -> str:
    if not settings.secret_key:
        raise AuthConfigError(
            "Не задан APP_SECRET_KEY: без него нельзя подписывать токены входа. "
            "Для разработки он уже есть в .env.example и docker-compose.yml."
        )
    return settings.secret_key


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Нужно войти",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _user_id_from_token(token: str) -> int | None:
    """id пользователя из токена. None — подпись не та, срок вышел или мусор."""
    try:
        payload = jwt.decode(
            token,
            _secret_key(),
            algorithms=[TOKEN_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError):
        return None


async def _load_user(
    *, credentials: HTTPAuthorizationCredentials | None, db: AsyncSession
) -> User | None:
    if credentials is None:
        return None
    user_id = _user_id_from_token(credentials.credentials)
    if user_id is None:
        return None
    # Пользователь берётся из базы при каждом запросе, а не из токена:
    # смена роли и удаление аккаунта действуют сразу, без перевыпуска токена.
    return await db.get(User, user_id)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Зависимость: вошедший пользователь. Нет токена или он плохой — 401."""
    user = await _load_user(credentials=credentials, db=db)
    if user is None:
        raise _unauthorized()
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Зависимость для открытых ручек, где вошедшему показываем больше.

    Например, в итогах голосования — за кого голосовал он сам. Просроченный
    или плохой токен здесь не ошибка: ручка открытая, отвечаем как гостю.
    Узнать, что токен устарел, фронтенд может по GET /api/auth/me.
    """
    return await _load_user(credentials=credentials, db=db)


def require_role(*roles: UserRole) -> Callable[..., Awaitable[User]]:
    """Зависимость: вошедший пользователь с одной из ролей, иначе 403.

    Администратор проходит всегда. Без входа — 401, как у get_current_user.
    """
    allowed = {*roles, UserRole.ADMIN}

    async def check_role(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав"
            )
        return user

    return check_role
