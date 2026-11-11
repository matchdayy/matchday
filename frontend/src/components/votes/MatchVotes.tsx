// Заглушка блока голосования за лучшего игрока матча. Голосование делается отдельной задачей —
// этот файл можно переписать целиком. Он вставлен в MatchPage одной строкой, чтобы экран
// голосования и экран матча не правили один и тот же файл.
// Проголосовать: useVote(matchId).mutate(playerId) — нужен вход; игроков берите из useMatch.

import { useMatchVotes } from '../../api/hooks'
import { ErrorState } from '../ErrorState'
import { Loading } from '../Loading'

export function MatchVotes({ matchId }: { matchId: number }) {
  const votes = useMatchVotes(matchId)

  if (votes.isPending) return <Loading />
  if (votes.isError) return <ErrorState error={votes.error} onRetry={() => votes.refetch()} />

  const { data } = votes
  return (
    <section className="section">
      <h2>Лучший игрок матча</h2>
      <p className="text-muted">
        {data.is_open ? `Голосование открыто до ${data.closes_at}` : 'Голосование закрыто или ещё не началось'}
        {data.my_vote_player_id !== null && ' · вы уже проголосовали'}
      </p>
      {data.winner && <p>Победитель: {data.winner.full_name}</p>}
      {data.results.length > 0 && (
        <p>
          Голоса: {data.results.map((row) => `${row.player.full_name} (${row.votes})`).join(', ')}
        </p>
      )}
    </section>
  )
}
