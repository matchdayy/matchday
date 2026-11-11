import { Link, Outlet } from 'react-router'
import { USE_MOCKS } from '../api/client'
import { useHealth } from '../api/hooks'

export function Layout() {
  return (
    <div className="layout">
      <header className="app-header">
        <Link to="/" className="app-header__logo">
          Матчдей
        </Link>
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

// Внизу каждой страницы видно, откуда берутся данные и отвечает ли бэкенд.
function ApiStatus() {
  const health = useHealth()

  if (USE_MOCKS) return <span>Данные: моки</span>
  if (health.isPending) return <span>Бэкенд: проверяем…</span>
  if (health.isError) return <span className="text-danger">Бэкенд недоступен</span>
  return <span>Бэкенд отвечает: {health.data.status}</span>
}
