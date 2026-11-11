// Заглушка. Личный кабинет делается отдельной задачей — этот файл можно переписать целиком.
// Страница закрыта RequireRole в App.tsx, поэтому пользователь здесь точно есть.

import { useNavigate } from 'react-router'
import { useDeleteAccount, useLogout, useMe } from '../api/hooks'
import { ROLE_LABELS } from '../api/roles'
import { ErrorState } from '../components/ErrorState'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function MePage() {
  const me = useMe()
  const logout = useLogout()
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()

  if (!me.data) return null
  const user = me.data

  const exit = () => {
    logout()
    navigate('/')
  }

  const remove = () => {
    // Удаление необратимо — в готовом экране нужен нормальный диалог подтверждения.
    if (!window.confirm('Удалить аккаунт вместе с фэнтези-командами и голосами? Отменить будет нельзя.')) return
    // mutateAsync, а не mutate с onSuccess: после удаления RequireRole сразу размонтирует страницу,
    // и колбэк mutate уже не вызвался бы. Ошибку показывает deleteAccount.error ниже.
    deleteAccount.mutateAsync().then(
      () => navigate('/'),
      () => undefined,
    )
  }

  return (
    <>
      <PageHeader title={user.display_name} subtitle={ROLE_LABELS[user.role]} />
      <PlaceholderNote />
      <ul className="list">
        <li>Почта: {user.email}</li>
        <li>Согласие на обработку персональных данных: {user.pd_consent_at}</li>
      </ul>
      <div className="stack section">
        <button type="button" className="button" onClick={exit}>
          Выйти
        </button>
        <button type="button" className="button" disabled={deleteAccount.isPending} onClick={remove}>
          Отозвать согласие и удалить аккаунт
        </button>
        {deleteAccount.isError && <ErrorState error={deleteAccount.error} title="Не удалось удалить аккаунт" />}
      </div>
    </>
  )
}
