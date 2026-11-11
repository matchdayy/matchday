// Сборка ответов API из строк «базы» моков. Здесь моки подражают бэкенду:
// счёт, таблица и статистика считаются по ленте событий, как это будет делать сервер.
// На страницах и в хуках так делать нельзя — там берём готовые цифры из ответа.

import type {
  AssistRow,
  Match,
  MatchClock,
  MatchEvent,
  MatchShort,
  Player,
  PlayerShort,
  PlayerStats,
  ScorerRow,
  Score,
  TableRow,
  Team,
  TeamListItem,
  TeamShort,
  Tournament,
} from '../types'
import {
  db,
  findPlayer,
  findRound,
  findTeam,
  findTournament,
  type EventRow,
  type MatchRow,
  type PlayerRow,
  type TeamRow,
  type TournamentRow,
} from './db'

export function toTeamShort(team: TeamRow): TeamShort {
  return { id: team.id, name: team.name, logo_url: team.logo_url }
}

export function toPlayerShort(player: PlayerRow): PlayerShort {
  return { id: player.id, full_name: player.full_name, number: player.number, position: player.position }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function toTournament(tournament: TournamentRow): Tournament {
  const now = today()
  const status = now < tournament.start_date ? 'upcoming' : now > tournament.end_date ? 'finished' : 'ongoing'
  return { ...tournament, status }
}

export function eventsOfMatch(matchId: number): EventRow[] {
  return db.events.filter((e) => e.match_id === matchId).sort((a, b) => a.minute - b.minute || a.id - b.id)
}

function matchesOfTournament(tournamentId: number): MatchRow[] {
  return db.matches
    .filter((m) => m.tournament_id === tournamentId)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

// Гол засчитывается команде забившего, автогол — сопернику.
function scoringTeamId(event: EventRow, match: MatchRow): number {
  const playerTeamId = findPlayer(event.player_id).team_id
  if (!event.is_own_goal) return playerTeamId
  return playerTeamId === match.home_team_id ? match.away_team_id : match.home_team_id
}

function computeScore(match: MatchRow): Score | null {
  if (match.status === 'scheduled' || match.status === 'cancelled') return null
  const score = { home: 0, away: 0 }
  for (const event of eventsOfMatch(match.id)) {
    if (event.type !== 'goal') continue
    if (scoringTeamId(event, match) === match.home_team_id) score.home += 1
    else score.away += 1
  }
  return score
}

export function toMatchEvent(event: EventRow): MatchEvent {
  const player = findPlayer(event.player_id)
  return {
    id: event.id,
    minute: event.minute,
    type: event.type,
    team_id: player.team_id,
    player: toPlayerShort(player),
    assist: event.assist_player_id === null ? null : toPlayerShort(findPlayer(event.assist_player_id)),
    is_own_goal: event.is_own_goal,
    client_id: event.client_id,
  }
}

const MAX_MINUTE = 150

// Игровое время по журналу статусов: складываем отрезки, когда матч был в статусе live.
// Перерывы (paused) не считаются.
export function matchClock(match: MatchRow): MatchClock | null {
  if (match.status === 'scheduled' || match.status === 'cancelled') return null
  let elapsedMs = 0
  let liveSince: number | null = null
  for (const entry of db.statusLog.filter((e) => e.match_id === match.id)) {
    const at = Date.parse(entry.at)
    if (liveSince !== null) elapsedMs += at - liveSince
    liveSince = entry.status === 'live' ? at : null
  }
  const running = match.status === 'live' && liveSince !== null
  if (running) elapsedMs += Date.now() - liveSince!
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  return {
    elapsed_seconds: elapsedSeconds,
    running,
    minute: Math.min(Math.floor(elapsedSeconds / 60) + 1, MAX_MINUTE),
  }
}

export function toMatchShort(match: MatchRow): MatchShort {
  return {
    id: match.id,
    starts_at: match.starts_at,
    venue: match.venue,
    status: match.status,
    home_team: toTeamShort(findTeam(match.home_team_id)),
    away_team: toTeamShort(findTeam(match.away_team_id)),
    score: computeScore(match),
  }
}

export function playersOfTeam(teamId: number): PlayerRow[] {
  return db.players.filter((p) => p.team_id === teamId)
}

export function toMatch(match: MatchRow): Match {
  const tournament = findTournament(match.tournament_id)
  return {
    ...toMatchShort(match),
    tournament: { id: tournament.id, name: tournament.name },
    home_players: playersOfTeam(match.home_team_id).map(toPlayerShort),
    away_players: playersOfTeam(match.away_team_id).map(toPlayerShort),
    events: eventsOfMatch(match.id).map(toMatchEvent),
    clock: matchClock(match),
    round: match.round_id === null ? null : roundRef(match.round_id),
  }
}

function roundRef(roundId: number) {
  const round = findRound(roundId)
  return { id: round.id, number: round.number, title: round.title }
}

export function tournamentMatches(tournamentId: number): MatchShort[] {
  return matchesOfTournament(tournamentId).map(toMatchShort)
}

function emptyRow(team: TeamRow): TableRow {
  return {
    position: 0,
    team: toTeamShort(team),
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goals_for: 0,
    goals_against: 0,
    goal_diff: 0,
    points: 0,
  }
}

function addResult(row: TableRow, scored: number, conceded: number): void {
  row.played += 1
  row.goals_for += scored
  row.goals_against += conceded
  row.goal_diff = row.goals_for - row.goals_against
  if (scored > conceded) row.won += 1
  else if (scored === conceded) row.drawn += 1
  else row.lost += 1
  row.points = row.won * 3 + row.drawn
}

// В таблицу идут только завершённые матчи. Сортировка: очки, разница, забитые, название.
export function buildTable(tournamentId: number): TableRow[] {
  const rows = new Map<number, TableRow>()
  db.teams.filter((t) => t.tournament_id === tournamentId).forEach((t) => rows.set(t.id, emptyRow(t)))

  for (const match of matchesOfTournament(tournamentId)) {
    const score = computeScore(match)
    if (match.status !== 'finished' || !score) continue
    addResult(rows.get(match.home_team_id)!, score.home, score.away)
    addResult(rows.get(match.away_team_id)!, score.away, score.home)
  }

  return [...rows.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_diff - a.goal_diff ||
        b.goals_for - a.goals_for ||
        a.team.name.localeCompare(b.team.name, 'ru'),
    )
    .map((row, index) => ({ ...row, position: index + 1 }))
}

function tournamentEvents(tournamentId: number): EventRow[] {
  const matchIds = new Set(matchesOfTournament(tournamentId).map((m) => m.id))
  return db.events.filter((e) => matchIds.has(e.match_id))
}

// Подсчёт «игрок → число» и сортировка по убыванию, при равенстве — по имени.
function rankPlayers(playerIds: number[]): { player: PlayerRow; count: number }[] {
  const counts = new Map<number, number>()
  playerIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
  return [...counts.entries()]
    .map(([id, count]) => ({ player: findPlayer(id), count }))
    .sort((a, b) => b.count - a.count || a.player.full_name.localeCompare(b.player.full_name, 'ru'))
}

export function buildScorers(tournamentId: number): ScorerRow[] {
  const scorerIds = tournamentEvents(tournamentId)
    .filter((e) => e.type === 'goal' && !e.is_own_goal)
    .map((e) => e.player_id)
  return rankPlayers(scorerIds).map(({ player, count }) => ({
    player: toPlayerShort(player),
    team: toTeamShort(findTeam(player.team_id)),
    goals: count,
  }))
}

export function buildAssists(tournamentId: number): AssistRow[] {
  const assistIds = tournamentEvents(tournamentId)
    .map((e) => e.assist_player_id)
    .filter((id): id is number => id !== null)
  return rankPlayers(assistIds).map(({ player, count }) => ({
    player: toPlayerShort(player),
    team: toTeamShort(findTeam(player.team_id)),
    assists: count,
  }))
}

export function toTeamListItem(team: TeamRow): TeamListItem {
  return { ...toTeamShort(team), players_count: playersOfTeam(team.id).length }
}

export function toTeam(team: TeamRow): Team {
  const tournament = findTournament(team.tournament_id)
  return {
    ...toTeamShort(team),
    tournament: { id: tournament.id, name: tournament.name },
    players: playersOfTeam(team.id).map((p) => ({ ...toPlayerShort(p), photo_url: p.photo_url })),
  }
}

function playerStats(playerId: number): PlayerStats {
  const stats = { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 }
  for (const event of db.events) {
    if (event.assist_player_id === playerId) stats.assists += 1
    if (event.player_id !== playerId) continue
    if (event.type === 'goal' && !event.is_own_goal) stats.goals += 1
    if (event.type === 'yellow_card') stats.yellow_cards += 1
    if (event.type === 'red_card') stats.red_cards += 1
  }
  return stats
}

export function toPlayer(player: PlayerRow): Player {
  return {
    ...toPlayerShort(player),
    photo_url: player.photo_url,
    team: toTeamShort(findTeam(player.team_id)),
    stats: playerStats(player.id),
  }
}
