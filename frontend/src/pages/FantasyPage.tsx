// Заглушка. Экран фэнтези-состава делается отдельной задачей — этот файл можно переписать целиком.
// Страница закрыта RequireRole: составы, команда и лиги — личные данные вошедшего пользователя.
// У каждого блока свои загрузка и ошибка.

import { Link, useParams } from 'react-router'
import {
  useFantasyPlayers,
  useFantasyRules,
  useMyFantasyTeam,
  useMyLeagues,
  useMyLineup,
  useRounds,
  useTournament,
} from '../api/hooks'
import type { Round } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

export function FantasyPage() {
  const id = Number(useParams().id)
  const tournament = useTournament(id)

  if (tournament.isPending) return <Loading />
  if (tournament.isError) return <ErrorState error={tournament.error} onRetry={() => tournament.refetch()} />

  return (
    <>
      <PageHeader
        title="Фэнтези"
        subtitle={<Link to={`/tournaments/${id}`}>{tournament.data.name}</Link>}
        actions={<Link to={`/tournaments/${id}/fantasy/rating`}>Рейтинг</Link>}
      />
      <PlaceholderNote />
      <RulesBlock />
      <MyTeamBlock tournamentId={id} />
      <RoundsBlock tournamentId={id} />
      <PlayersBlock tournamentId={id} />
    </>
  )
}

function RulesBlock() {
  const rules = useFantasyRules()

  return (
    <section className="section">
      <h2>Правила</h2>
      {rules.isPending && <Loading />}
      {rules.isError && <ErrorState error={rules.error} onRetry={() => rules.refetch()} />}
      {rules.data && (
        <p>
          Игроков в составе: {rules.data.squad_size}, бюджет: {rules.data.budget}, из одной команды — не больше{' '}
          {rules.data.max_per_team}. Очки:{' '}
          {Object.entries(rules.data.points)
            .map(([reason, points]) => `${reason} ${points}`)
            .join(', ')}
        </p>
      )}
    </section>
  )
}

function MyTeamBlock({ tournamentId }: { tournamentId: number }) {
  const team = useMyFantasyTeam(tournamentId)
  const leagues = useMyLeagues(tournamentId)

  return (
    <section className="section">
      <h2>Моя команда</h2>
      {team.isPending && <Loading />}
      {team.isError && <ErrorState error={team.error} onRetry={() => team.refetch()} />}
      {team.data === null && <EmptyState>Команда ещё не создана — useCreateFantasyTeam</EmptyState>}
      {team.data && (
        <p>
          {team.data.name} · <Link to={`/fantasy/teams/${team.data.id}/points`}>журнал очков</Link>
        </p>
      )}
      {leagues.isError && <ErrorState error={leagues.error} onRetry={() => leagues.refetch()} />}
      {leagues.data && (
        <p>
          Лиги:{' '}
          {leagues.data.length === 0
            ? 'пока нет'
            : leagues.data.map((league) => (
                <span key={league.id}>
                  <Link to={`/fantasy/leagues/${league.id}`}>{league.name}</Link> (код {league.invite_code},{' '}
                  {league.members_count} уч.){' '}
                </span>
              ))}
        </p>
      )}
    </section>
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
            <RoundRow key={round.id} round={round} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RoundRow({ round }: { round: Round }) {
  const lineup = useMyLineup(round.id)

  let lineupText = 'загрузка…'
  if (lineup.isError) lineupText = 'не удалось загрузить состав'
  else if (lineup.data === null) lineupText = 'состава нет'
  else if (lineup.data) {
    lineupText = `${lineup.data.players.map((p) => p.full_name).join(', ')} — ${lineup.data.total_price}${
      lineup.data.locked ? ', изменить нельзя' : ''
    }`
  }

  return (
    <li>
      {round.title}: дедлайн {round.deadline}
      {round.closed_at ? `, закрыт ${round.closed_at}` : ''}. Мой состав: {lineupText}
    </li>
  )
}

function PlayersBlock({ tournamentId }: { tournamentId: number }) {
  const players = useFantasyPlayers(tournamentId)

  return (
    <section className="section">
      <h2>Игроки</h2>
      {players.isPending && <Loading />}
      {players.isError && <ErrorState error={players.error} onRetry={() => players.refetch()} />}
      {players.data && (
        <p>
          Доступно игроков: {players.data.length}. Например:{' '}
          {players.data
            .slice(0, 5)
            .map((p) => `${p.full_name} (${p.team.name}, ${p.price})`)
            .join(', ')}
        </p>
      )}
    </section>
  )
}
