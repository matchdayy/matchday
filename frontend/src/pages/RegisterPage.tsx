// Заглушка. Экран регистрации делается отдельной задачей — этот файл можно переписать целиком.
// Без галочки согласия сервер ответит 422 — так и задумано, текст ошибки придёт в error.detail.

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useRegister } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { safeNextPath } from '../components/nextPath'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const register = useRegister()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    register.mutate(
      { email, password, display_name: displayName, pd_consent: consent },
      { onSuccess: () => navigate(next, { replace: true }) },
    )
  }

  return (
    <>
      <PageHeader title="Регистрация" />
      <PlaceholderNote />
      <form className="stack" onSubmit={submit}>
        <label className="stack">
          Почта
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="stack">
          Имя, которое увидят другие
          <input
            className="input"
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="stack">
          Пароль
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Согласен на
          обработку персональных данных
        </label>
        {register.isError && <ErrorState error={register.error} title="Не удалось зарегистрироваться" />}
        <button type="submit" className="button button--primary" disabled={register.isPending}>
          Зарегистрироваться
        </button>
      </form>
      <p className="section">
        Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(next)}`}>Войти</Link>
      </p>
    </>
  )
}
