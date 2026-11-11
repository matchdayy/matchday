import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.models.base import Base, TimestampMixin


class UserRole(enum.StrEnum):
    VIEWER = "viewer"  # зритель: фэнтези, голосование
    OPERATOR = "operator"  # оператор: ведёт ленту и статус матча
    ADMIN = "admin"  # администратор турнира: может всё, что оператор, и больше


class User(TimestampMixin, Base):
    """Пользователь приложения.

    Пароль в открытом виде не хранится нигде, только хеш bcrypt
    (app/auth.py). Зарегистрироваться можно только зрителем,
    другую роль выдаёт администратор.
    """

    __tablename__ = "users"
    __table_args__ = (
        # Почта хранится в нижнем регистре, иначе Ivan@itmo.ru и ivan@itmo.ru
        # стали бы двумя разными аккаунтами.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # 254 символа — максимальная длина адреса почты по стандарту.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    display_name: Mapped[str] = mapped_column(String(50))
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            native_enum=False,
            create_constraint=True,
            length=20,
            name="role",
            values_callable=lambda e: [item.value for item in e],
        ),
        default=UserRole.VIEWER,
        server_default=UserRole.VIEWER.value,
    )
    # Когда пользователь согласился на обработку персональных данных.
    # Требование ТЗ: без согласия аккаунта нет, поэтому поле обязательное.
    # Отзыв согласия — это удаление аккаунта вместе со всем, что к нему
    # привязано (у всех ссылок на users стоит ondelete="CASCADE").
    pd_consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    @validates("email")
    def _normalize_email(self, _key: str, email: str) -> str:
        """Приводит почту к нижнему регистру при любом присваивании.

        Искать пользователя по почте тоже нужно в нижнем регистре:
        select(User).where(User.email == email.strip().lower()).
        """
        return email.strip().lower()
