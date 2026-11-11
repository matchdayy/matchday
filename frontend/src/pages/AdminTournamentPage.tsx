// Заглушка. Администрирование турнира делается отдельной задачей — этот файл можно переписать целиком.
// Закрыта RequireRole admin в App.tsx. Хуки записи для этого экрана принимают id турнира:
// useCreateRound, useUpdateRound, useDeleteRound, useCloseRound,
// useCreateMatch, useUpdateMatch, useDeleteMatch,
// useUpdateTeam, useDeleteTeam, useUpdatePlayer, useDeletePlayer.

import { Link, useParams } from 'react-router'
import { useRounds, useTournament, useTournamentMatches, useTournamentTeams } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { MatchStatusBadge } from '../components/MatchStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function AdminTournamentPage() {
  const id = Number(useParams().id)
  const tournament = useTournament(id)

  if (tournament.isPending) return <Loading />
  if (tournament.isError) return <ErrorState error={tournament.error} onRetry={() => tournament.refetch()} />

  return (
    <>
      <PageHeader
        title={tournament.data.name}
        subtitle={<Link to="/admin">Администрирование</Link>}
        actions={<Link to={`/tournaments/${id}`}>Как видят зрители</Link>}
      />
      <PlaceholderNote />
      <RoundsBlock tournamentId={id} />
      <MatchesBlock tournamentId={id} />
      <TeamsBlock tournamentId={id} />
    </>
  )
}

function RoundsBlock({ tournamentId }: { tournamentId: number }) {
  const rounds = useRounds(tournamentId)

  return (
    <section className="section">
      <h2>Туры</h2>
      {rounds.isPending && <Loading />}
      {rounds.isError && <ErrorState error={rounds.error} onRetry={() => rounds.refetch()} />}
      {rounds.data?.length === 0 && <EmptyState>Туров пока нет</EmptyState>}
      {rounds.data && rounds.data.length > 0 && (
        <ul className="list">
          {rounds.data.map((round) => (
            <li key={round.id}>
              {round.title} · дедлайн {round.deadline} · {round.closed_at ? `закрыт ${round.closed_at}` : 'открыт'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MatchesBlock({ tournamentId }: { tournamentId: number }) {
  const matches = useTournamentMatches(tournamentId)

  return (
    <section className="section">
      <h2>Календарь</h2>
      {matches.isPending && <Loading />}
      {matches.isError && <ErrorState error={matches.error} onRetry={() => matches.refetch()} />}
      {matches.data?.length === 0 && <EmptyState>Матчей пока нет</EmptyState>}
      {matches.data && matches.data.length > 0 && (
        <ul className="list">
          {matches.data.map((match) => (
            <li key={match.id}>
              <Link to={`/operator/matches/${match.id}`}>
                {match.home_team.name} — {match.away_team.name}
              </Link>{' '}
              · {match.starts_at} <MatchStatusBadge status={match.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TeamsBlock({ tournamentId }: { tournamentId: number }) {
  const teams = useTournamentTeams(tournamentId)

  return (
    <section className="section">
      <h2>Команды</h2>
      {teams.isPending && <Loading />}
      {teams.isError && <ErrorState error={teams.error} onRetry={() => teams.refetch()} />}
      {teams.data?.length === 0 && <EmptyState>Команд пока нет</EmptyState>}
      {teams.data && teams.data.length > 0 && (
        <ul className="list">
          {teams.data.map((team) => (
            <li key={team.id}>
              <Link to={`/teams/${team.id}`}>{team.name}</Link> · игроков: {team.players_count}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
