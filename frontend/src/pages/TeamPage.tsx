// Заглушка из каркаса. Экран команды делается в задаче #43 —
// этот файл можно переписать целиком.

import { Link, useParams } from 'react-router'
import { useTeam } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function TeamPage() {
  const id = Number(useParams().id)
  const team = useTeam(id)

  if (team.isPending) return <Loading />
  if (team.isError) return <ErrorState error={team.error} onRetry={() => team.refetch()} />

  const { data } = team

  return (
    <>
      <PageHeader
        title={data.name}
        subtitle={<Link to={`/tournaments/${data.tournament.id}`}>{data.tournament.name}</Link>}
      />
      <PlaceholderNote />

      <section className="section">
        <h2>Состав</h2>
        {data.players.length === 0 ? (
          <EmptyState>Состав пока не заявлен</EmptyState>
        ) : (
          <ul className="list">
            {data.players.map((player) => (
              <li key={player.id}>
                {player.number ?? '—'} <Link to={`/players/${player.id}`}>{player.full_name}</Link>{' '}
                <span className="text-muted">{player.position}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
