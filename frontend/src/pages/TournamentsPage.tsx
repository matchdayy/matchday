// Заглушка из каркаса. Экран списка турниров делается в задаче #39 —
// этот файл можно переписать целиком.

import { Link } from 'react-router'
import { useTournaments } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function TournamentsPage() {
  const tournaments = useTournaments()

  return (
    <>
      <PageHeader title="Турниры" />
      <PlaceholderNote />

      {tournaments.isPending && <Loading />}
      {tournaments.isError && <ErrorState error={tournaments.error} onRetry={() => tournaments.refetch()} />}
      {tournaments.data?.length === 0 && <EmptyState>Турниров пока нет</EmptyState>}
      {tournaments.data && tournaments.data.length > 0 && (
        <ul className="list">
          {tournaments.data.map((tournament) => (
            <li key={tournament.id} className="card">
              <Link to={`/tournaments/${tournament.id}`}>{tournament.name}</Link>
              <div className="text-muted">
                {tournament.sport} · {tournament.start_date} — {tournament.end_date} · {tournament.status}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
