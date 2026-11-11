// Заглушка из каркаса. Экран турнира делается в задаче #40 —
// этот файл можно переписать целиком.
// У каждого блока свои загрузка и ошибка: ошибка таблицы не должна прятать матчи.

import { Link, useParams } from 'react-router'
import {
  useTournament,
  useTournamentAssists,
  useTournamentMatches,
  useTournamentScorers,
  useTournamentTable,
} from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { MatchStatusBadge } from '../components/MatchStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { TeamName } from '../components/TeamName'

export function TournamentPage() {
  const id = Number(useParams().id)
  const tournament = useTournament(id)

  if (tournament.isPending) return <Loading />
  if (tournament.isError) return <ErrorState error={tournament.error} onRetry={() => tournament.refetch()} />

  return (
    <>
      <PageHeader
        title={tournament.data.name}
        subtitle={`${tournament.data.start_date} — ${tournament.data.end_date} · ${tournament.data.status}`}
      />
      <PlaceholderNote />
      <TableBlock tournamentId={id} />
      <MatchesBlock tournamentId={id} />
      <LeadersBlock tournamentId={id} />
    </>
  )
}

function TableBlock({ tournamentId }: { tournamentId: number }) {
  const table = useTournamentTable(tournamentId)

  return (
    <section className="section">
      <h2>Таблица</h2>
      {table.isPending && <Loading />}
      {table.isError && <ErrorState error={table.error} onRetry={() => table.refetch()} />}
      {table.data?.length === 0 && <EmptyState>Команд пока нет</EmptyState>}
      {table.data && table.data.length > 0 && (
        <ol className="list">
          {table.data.map((row) => (
            <li key={row.team.id}>
              {row.position}. <TeamName team={row.team} link /> — {row.points} очк., игр {row.played}, мячи{' '}
              {row.goals_for}:{row.goals_against}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function MatchesBlock({ tournamentId }: { tournamentId: number }) {
  const matches = useTournamentMatches(tournamentId)

  return (
    <section className="section">
      <h2>Матчи</h2>
      {matches.isPending && <Loading />}
      {matches.isError && <ErrorState error={matches.error} onRetry={() => matches.refetch()} />}
      {matches.data?.length === 0 && <EmptyState>Матчей пока нет</EmptyState>}
      {matches.data && matches.data.length > 0 && (
        <ul className="list">
          {matches.data.map((match) => (
            <li key={match.id}>
              <Link to={`/matches/${match.id}`}>
                {match.home_team.name} {match.score ? `${match.score.home}:${match.score.away}` : '—:—'}{' '}
                {match.away_team.name}
              </Link>{' '}
              <MatchStatusBadge status={match.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Бомбардиры и ассистенты: какому экрану они достанутся, пока не решено.
function LeadersBlock({ tournamentId }: { tournamentId: number }) {
  const scorers = useTournamentScorers(tournamentId)
  const assists = useTournamentAssists(tournamentId)

  return (
    <section className="section">
      <h2>Лидеры</h2>
      {(scorers.isPending || assists.isPending) && <Loading />}
      {scorers.isError && <ErrorState error={scorers.error} onRetry={() => scorers.refetch()} />}
      {assists.isError && <ErrorState error={assists.error} onRetry={() => assists.refetch()} />}
      {scorers.data && (
        <p>
          Голы:{' '}
          {scorers.data.length === 0
            ? 'пока нет'
            : scorers.data.map((row) => `${row.player.full_name} (${row.goals})`).join(', ')}
        </p>
      )}
      {assists.data && (
        <p>
          Передачи:{' '}
          {assists.data.length === 0
            ? 'пока нет'
            : assists.data.map((row) => `${row.player.full_name} (${row.assists})`).join(', ')}
        </p>
      )}
    </section>
  )
}
