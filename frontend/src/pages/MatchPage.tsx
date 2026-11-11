// Заглушка из каркаса. Экран матча делается в задаче #41 —
// этот файл можно переписать целиком.

import { Link, useParams } from 'react-router'
import { MATCH_POLL_INTERVAL_MS, useMatch } from '../api/hooks'
import type { EventType, MatchEvent } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { MatchStatusBadge } from '../components/MatchStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { TeamName } from '../components/TeamName'
import { MatchVotes } from '../components/votes/MatchVotes'

const EVENT_LABELS: Record<EventType, string> = {
  goal: 'Гол',
  yellow_card: 'Жёлтая карточка',
  red_card: 'Красная карточка',
}

function describeEvent(event: MatchEvent): string {
  const label = event.is_own_goal ? 'Автогол' : EVENT_LABELS[event.type]
  const assist = event.assist ? `, передача: ${event.assist.full_name}` : ''
  return `${event.minute}′ ${label}: ${event.player.full_name}${assist}`
}

export function MatchPage() {
  const id = Number(useParams().id)
  const match = useMatch(id)

  if (match.isPending) return <Loading />
  if (match.isError) return <ErrorState error={match.error} onRetry={() => match.refetch()} />

  const { data } = match
  // Счёт берём из ответа сервера, а не считаем по ленте.
  const score = data.score ? `${data.score.home} : ${data.score.away}` : '— : —'
  const isInProgress = data.status === 'live' || data.status === 'paused'

  return (
    <>
      <PageHeader
        title={
          <>
            <TeamName team={data.home_team} link /> {score} <TeamName team={data.away_team} link />
          </>
        }
        subtitle={<Link to={`/tournaments/${data.tournament.id}`}>{data.tournament.name}</Link>}
        actions={<MatchStatusBadge status={data.status} />}
      />
      <PlaceholderNote />
      {isInProgress && (
        <p className="text-muted">Данные обновляются сами каждые {MATCH_POLL_INTERVAL_MS / 1000} секунды.</p>
      )}

      <section className="section">
        <h2>Лента</h2>
        {data.events.length === 0 ? (
          <EmptyState>Событий пока нет</EmptyState>
        ) : (
          <ul className="list">
            {data.events.map((event) => (
              <li key={event.id}>{describeEvent(event)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Составы</h2>
        <p>
          {data.home_team.name}: {data.home_players.map((p) => p.full_name).join(', ')}
        </p>
        <p>
          {data.away_team.name}: {data.away_players.map((p) => p.full_name).join(', ')}
        </p>
      </section>

      {data.status === 'finished' && <MatchVotes matchId={data.id} />}
    </>
  )
}
