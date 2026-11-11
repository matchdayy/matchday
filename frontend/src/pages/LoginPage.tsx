// Заглушка. Экран входа делается отдельной задачей — этот файл можно переписать целиком.
// Здесь только проверка, что вход работает: форма без оформления и переход обратно по ?next=.

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { USE_MOCKS } from '../api/client'
import { useLogin } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { safeNextPath } from '../components/nextPath'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate(next, { replace: true }) })
  }

  return (
    <>
      <PageHeader title="Вход" />
      <PlaceholderNote />
      <form className="stack" onSubmit={submit}>
        <label className="stack">
          Почта
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="stack">
          Пароль
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {USE_MOCKS && (
          <p className="text-muted">
            В моках: viewer@demo.local, operator@demo.local или admin@demo.local, пароль demo
          </p>
        )}
        {login.isError && <ErrorState error={login.error} title="Не удалось войти" />}
        <button type="submit" className="button button--primary" disabled={login.isPending || !email || !password}>
          Войти
        </button>
      </form>
      <p className="section">
        Нет аккаунта? <Link to={`/register?next=${encodeURIComponent(next)}`}>Зарегистрироваться</Link>
      </p>
    </>
  )
}
