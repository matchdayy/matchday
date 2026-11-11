import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useMe } from '../api/hooks'
import { ROLE_LABELS, hasRole } from '../api/roles'
import type { Role } from '../api/types'
import { ErrorState } from './ErrorState'
import { Loading } from './Loading'
import { PageHeader } from './PageHeader'

type Props = {
  // Минимальная роль: 'viewer' — любой вошедший, 'operator' пускает и администратора.
  role: Role
  // Без children работает как обёртка маршрутов в App.tsx и показывает вложенные через <Outlet />.
  children?: ReactNode
}

// Не вошёл — отправляем на /login?next=<этот адрес>, после входа вернём обратно.
// Вошёл, но роль ниже нужной — объясняем, что делать, вместо пустой страницы.
export function RequireRole({ role, children }: Props) {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return <Loading />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />

  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  if (!hasRole(me.data, role)) {
    return (
      <>
        <PageHeader title="Нет доступа" />
        <p>
          Эта страница доступна роли «{ROLE_LABELS[role]}». Вы вошли как {me.data.display_name}, ваша роль —
          «{ROLE_LABELS[me.data.role]}».
        </p>
        <p className="text-muted">Роль выдаёт администратор турнира.</p>
        <p>
          <Link to="/">К списку турниров</Link>
        </p>
      </>
    )
  }

  return children ?? <Outlet />
}
