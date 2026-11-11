// Заглушка. Экран пользователей и ролей делается отдельной задачей — этот файл можно переписать целиком.
// Закрыта RequireRole admin в App.tsx. Сменить роль: useChangeRole().mutate({ userId, role }).
// Свою роль администратор поменять не может — сервер ответит 409.

import { useUsers } from '../api/hooks'
import { ROLE_LABELS } from '../api/roles'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function AdminUsersPage() {
  const users = useUsers()

  return (
    <>
      <PageHeader title="Пользователи и роли" />
      <PlaceholderNote />
      {users.isPending && <Loading />}
      {users.isError && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
      {users.data && (
        <ul className="list">
          {users.data.map((user) => (
            <li key={user.id}>
              {user.display_name} · {user.email} · {ROLE_LABELS[user.role]}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
