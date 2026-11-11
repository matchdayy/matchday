import { Link, Outlet } from 'react-router'
import { USE_MOCKS } from '../api/client'
import { useHealth, useMe } from '../api/hooks'
import { hasRole } from '../api/roles'

export function Layout() {
  return (
    <div className="layout">
      <header className="app-header">
        <Link to="/" className="app-header__logo">
          Матчдей
        </Link>
        <UserMenu />
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="app-footer">
        <ApiStatus />
      </footer>
    </div>
  )
}

// Справа в шапке: «Войти» для гостя, имя — для вошедшего.
function UserMenu() {
  const me = useMe()

  // Пока не знаем, вошёл ли пользователь, ничего не показываем — чтобы «Войти» не мигало.
  if (me.isPending || me.isError) return null
  if (!me.data) {
    return (
      <nav className="app-header__nav">
        <Link to="/login">Войти</Link>
      </nav>
    )
  }
  return (
    <nav className="app-header__nav">
      {hasRole(me.data, 'admin') && <Link to="/admin">Администрирование</Link>}
      <Link to="/me">{me.data.display_name}</Link>
    </nav>
  )
}

// Внизу каждой страницы видно, откуда берутся данные и отвечает ли бэкенд.
function ApiStatus() {
  const health = useHealth()

  if (USE_MOCKS) return <span>Данные: моки</span>
  if (health.isPending) return <span>Бэкенд: проверяем…</span>
  if (health.isError) return <span className="text-danger">Бэкенд недоступен</span>
  return <span>Бэкенд отвечает: {health.data.status}</span>
}
