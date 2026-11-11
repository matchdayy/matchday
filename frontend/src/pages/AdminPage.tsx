// Заглушка. Главная страница администрирования делается отдельной задачей —
// этот файл можно переписать целиком. Закрыта RequireRole admin в App.tsx.
// Создание и правка турнира: useCreateTournament, useUpdateTournament, useDeleteTournament.

import { Link } from 'react-router'
import { useTournaments } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function AdminPage() {
  const tournaments = useTournaments()

  return (
    <>
      <PageHeader title="Администрирование" actions={<Link to="/admin/users">Пользователи и роли</Link>} />
      <PlaceholderNote />
      <section className="section">
        <h2>Турниры</h2>
        {tournaments.isPending && <Loading />}
        {tournaments.isError && <ErrorState error={tournaments.error} onRetry={() => tournaments.refetch()} />}
        {tournaments.data?.length === 0 && <EmptyState>Турниров пока нет</EmptyState>}
        {tournaments.data && tournaments.data.length > 0 && (
          <ul className="list">
            {tournaments.data.map((tournament) => (
              <li key={tournament.id}>
                <Link to={`/admin/tournaments/${tournament.id}`}>{tournament.name}</Link> · {tournament.start_date} —{' '}
                {tournament.end_date}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
