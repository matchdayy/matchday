"""Примитивы входа: пароль, токен, зависимости get_current_user и require_role.

Ручек входа ещё нет, поэтому зависимости проверяются на маленьком
отдельном приложении с ручками-заглушками. База настоящая, как в
остальных тестах ручек.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth import (
    AuthConfigError,
    create_access_token,
    get_current_user,
    get_optional_user,
    hash_password,
    require_role,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.models import User, UserRole
from tests.conftest import get_test_db

MISSING_ID = 999_999_999
TEST_SECRET = "test-secret-only-for-pytest-0123456789"

stub_app = FastAPI()
stub_app.dependency_overrides[get_db] = get_test_db


@stub_app.get("/me")
async def me(user: User = Depends(get_current_user)) -> dict[str, int]:
    return {"id": user.id}


@stub_app.get("/operator-only")
async def operator_only(
    user: User = Depends(require_role(UserRole.OPERATOR)),
) -> dict[str, int]:
    return {"id": user.id}


@stub_app.get("/maybe-me")
async def maybe_me(
    user: User | None = Depends(get_optional_user),
) -> dict[str, int | None]:
    return {"id": user.id if user else None}


@pytest.fixture(autouse=True)
def secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Свой ключ, чтобы тесты не зависели от APP_SECRET_KEY на машине."""
    monkeypatch.setattr(settings, "secret_key", TEST_SECRET)


@pytest.fixture
def stub_client() -> TestClient:
    return TestClient(stub_app)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_password_hash_verifies():
    password_hash = hash_password("правильный пароль")

    assert password_hash != "правильный пароль"
    assert verify_password(password="правильный пароль", password_hash=password_hash)
    assert not verify_password(password="другой пароль", password_hash=password_hash)


def test_same_password_hashes_differ():
    # Соль у каждого хеша своя: одинаковые пароли не видно по одинаковым хешам.
    assert hash_password("пароль123") != hash_password("пароль123")


def test_too_long_password():
    long_password = "я" * 40  # 80 байт в UTF-8

    with pytest.raises(ValueError):
        hash_password(long_password)
    assert not verify_password(
        password=long_password, password_hash=hash_password("пароль123")
    )


def test_token_requires_secret_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "secret_key", "")

    with pytest.raises(AuthConfigError):
        create_access_token(user_id=1)


def test_valid_token_returns_user(stub_client: TestClient, users: dict[UserRole, User]):
    viewer = users[UserRole.VIEWER]

    response = stub_client.get(
        "/me", headers=bearer(create_access_token(user_id=viewer.id))
    )

    assert response.status_code == 200
    assert response.json() == {"id": viewer.id}


def test_token_lives_seven_days():
    token = create_access_token(user_id=1)

    payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
    assert payload["exp"] - payload["iat"] == 7 * 24 * 60 * 60


def test_no_header_is_401(stub_client: TestClient):
    response = stub_client.get("/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Нужно войти"}


def test_wrong_signature_is_401(stub_client: TestClient, users: dict[UserRole, User]):
    token = jwt.encode(
        {
            "sub": str(users[UserRole.ADMIN].id),
            "exp": datetime.now(tz=UTC) + timedelta(days=1),
        },
        "some-other-secret-key-0123456789abcdef",
        algorithm="HS256",
    )

    response = stub_client.get("/me", headers=bearer(token))

    assert response.status_code == 401


def test_expired_token_is_401(stub_client: TestClient, users: dict[UserRole, User]):
    token = jwt.encode(
        {
            "sub": str(users[UserRole.VIEWER].id),
            "exp": datetime.now(tz=UTC) - timedelta(minutes=1),
        },
        TEST_SECRET,
        algorithm="HS256",
    )

    response = stub_client.get("/me", headers=bearer(token))

    assert response.status_code == 401


def test_garbage_token_is_401(stub_client: TestClient):
    response = stub_client.get("/me", headers=bearer("not-a-token"))

    assert response.status_code == 401


def test_token_of_deleted_user_is_401(stub_client: TestClient):
    token = create_access_token(user_id=MISSING_ID)

    response = stub_client.get("/me", headers=bearer(token))

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("role", "expected_status"),
    [
        (UserRole.OPERATOR, 200),
        (UserRole.ADMIN, 200),
        (UserRole.VIEWER, 403),
    ],
)
def test_require_role(
    stub_client: TestClient,
    users: dict[UserRole, User],
    role: UserRole,
    expected_status: int,
):
    token = create_access_token(user_id=users[role].id)

    response = stub_client.get("/operator-only", headers=bearer(token))

    assert response.status_code == expected_status


def test_require_role_forbidden_text(
    stub_client: TestClient, users: dict[UserRole, User]
):
    token = create_access_token(user_id=users[UserRole.VIEWER].id)

    response = stub_client.get("/operator-only", headers=bearer(token))

    assert response.json() == {"detail": "Недостаточно прав"}


def test_require_role_without_token_is_401(stub_client: TestClient):
    response = stub_client.get("/operator-only")

    assert response.status_code == 401


def test_optional_user(stub_client: TestClient, users: dict[UserRole, User]):
    viewer = users[UserRole.VIEWER]
    token = create_access_token(user_id=viewer.id)

    assert stub_client.get("/maybe-me").json() == {"id": None}
    assert stub_client.get("/maybe-me", headers=bearer(token)).json() == {
        "id": viewer.id
    }
    # Плохой токен на открытой ручке — просто гость, а не ошибка.
    assert stub_client.get("/maybe-me", headers=bearer("not-a-token")).json() == {
        "id": None
    }
