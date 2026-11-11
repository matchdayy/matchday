// Голосование за лучшего игрока матча: один голос на пользователя, только за игрока
// одной из двух команд, открыто 24 часа после завершения матча.

import type { VoteResults } from '../types'
import { conflict, db, findMatch, findPlayer, invalid, type MatchRow, type UserRow } from './db'
import { toPlayerShort } from './views'

const VOTING_PERIOD_MS = 24 * 60 * 60 * 1000

// Момент завершения — последняя запись finished в журнале статусов.
function closesAt(match: MatchRow): number | null {
  if (match.status !== 'finished') return null
  const finished = db.statusLog.filter((e) => e.match_id === match.id && e.status === 'finished').pop()
  return finished ? Date.parse(finished.at) + VOTING_PERIOD_MS : null
}

function isOpen(match: MatchRow): boolean {
  const closes = closesAt(match)
  return closes !== null && Date.now() < closes
}

export function voteResults(matchId: number, user: UserRow | null): VoteResults {
  const match = findMatch(matchId)
  const votes = db.votes.filter((v) => v.match_id === match.id)
  const counts = new Map<number, number>()
  votes.forEach((v) => counts.set(v.player_id, (counts.get(v.player_id) ?? 0) + 1))

  const results = [...counts.entries()]
    .map(([playerId, count]) => ({ player: findPlayer(playerId), votes: count }))
    .sort((a, b) => b.votes - a.votes || a.player.full_name.localeCompare(b.player.full_name, 'ru'))
    .map(({ player, votes: count }) => ({ player: toPlayerShort(player), team_id: player.team_id, votes: count }))

  const open = isOpen(match)
  const closes = closesAt(match)
  // Победитель — только после закрытия и только если он один.
  const hasSingleLeader = results.length > 0 && (results.length === 1 || results[0].votes > results[1].votes)
  const winner = !open && closes !== null && hasSingleLeader ? results[0].player : null

  return {
    match_id: match.id,
    is_open: open,
    closes_at: closes === null ? null : new Date(closes).toISOString(),
    my_vote_player_id: (user && votes.find((v) => v.user_id === user.id)?.player_id) ?? null,
    results,
    winner,
  }
}

export function vote(user: UserRow, matchId: number, body: unknown): VoteResults {
  const match = findMatch(matchId)
  if (match.status !== 'finished') conflict('Голосовать можно только после завершения матча')
  if (!isOpen(match)) conflict('Голосование закрыто: прошло больше суток после матча')
  if (db.votes.some((v) => v.match_id === match.id && v.user_id === user.id)) conflict('Вы уже проголосовали')

  const playerId = (body as { player_id?: unknown } | undefined)?.player_id
  if (typeof playerId !== 'number') invalid('Не указан игрок')
  const player = db.players.find((p) => p.id === playerId)
  if (!player || (player.team_id !== match.home_team_id && player.team_id !== match.away_team_id)) {
    invalid('Игрок не играл в этом матче')
  }
  db.votes.push({ match_id: match.id, user_id: user.id, player_id: player.id })
  return voteResults(match.id, user)
}
