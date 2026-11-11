from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Настройки приложения. Читаются из переменных окружения с префиксом APP_."""

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@postgres:5432/matchday"
    )
    # Ключ, которым подписываются токены входа (APP_SECRET_KEY). Кто знает
    # ключ, может выписать себе токен администратора, поэтому значения
    # по умолчанию нет: без ключа приложение откажется выдавать токены.
    secret_key: str = ""

    model_config = {"env_file": ".env", "env_prefix": "APP_"}


settings = Settings()
