// Администрирование в моках: турниры, календарь, команды, игроки.
// Удаление того, на что уже ссылаются события или матчи, запрещено (409) — как на бэкенде.

import type { Match, MatchInput, Player, PlayerUpdate, Team, TeamUpdate, Tournament, TournamentInput } from '../types'
import {
  conflict,
  db,
  findMatch,
  findPlayer,
  findTeam,
  findTournament,
  invalid,
  nextId,
  type MatchRow,
  type TournamentRow,
} from './db'
import { toMatch, toPlayer, toTeam, toTournament } from './views'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function nonEmpty(value: unknown, detail: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(detail)
  return value.trim()
}

function optionalText(value: unknown, detail: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') invalid(detail)
  return value.trim()
}

// ---------- Турниры ----------

function validateTournament(input: Partial<TournamentInput>): TournamentInput {
  const name = nonEmpty(input.name, 'Укажите название турнира')
  const sport = nonEmpty(input.sport, 'Укажите вид спорта')
  if (!/^[a-z_]+$/.test(sport)) invalid('Вид спорта — латиницей, например football')
  if (typeof input.start_date !== 'string' || !DATE_RE.test(input.start_date)) invalid('Дата начала — в виде 2026-11-01')
  if (typeof input.end_date !== 'string' || !DATE_RE.test(input.end_date)) invalid('Дата окончания — в виде 2026-11-30')
  if (input.end_date < input.start_date) invalid('Дата окончания не может быть раньше даты начала')
  return { name, sport, start_date: input.start_date, end_date: input.end_date }
}

export function createTournament(body: unknown): Tournament {
  const row: TournamentRow = { id: nextId(db.tournaments), ...validateTournament((body ?? {}) as Partial<TournamentInput>) }
  db.tournaments.push(row)
  return toTournament(row)
}

export function updateTournament(id: number, body: unknown): Tournament {
  const row = findTournament(id)
  Object.assign(row, validateTournament({ ...row, ...(body as Partial<TournamentInput>) }))
  return toTournament(row)
}

export function deleteTournament(id: number): void {
  const row = findTournament(id)
  if (db.teams.some((t) => t.tournament_id === id) || db.matches.some((m) => m.tournament_id === id)) {
    conflict('В турнире есть команды или матчи — сначала удалите их')
  }
  const fantasyTeamIds = new Set(db.fantasyTeams.filter((t) => t.tournament_id === id).map((t) => t.id))
  db.rounds = db.rounds.filter((r) => r.tournament_id !== id)
  db.fantasyTeams = db.fantasyTeams.filter((t) => t.tournament_id !== id)
  db.lineups = db.lineups.filter((l) => !fantasyTeamIds.has(l.fantasy_team_id))
  db.leagues = db.leagues.filter((l) => l.tournament_id !== id)
  db.tournaments.splice(db.tournaments.indexOf(row), 1)
}

// ---------- Календарь ----------

function teamOfTournament(teamId: unknown, tournamentId: number) {
  if (typeof teamId !== 'number') invalid('Укажите обе команды')
  const team = findTeam(teamId)
  if (team.tournament_id !== tournamentId) invalid(`Команда «${team.name}» не из этого турнира`)
  return team
}

function validateMatch(tournamentId: number, input: Partial<MatchInput>): MatchInput {
  const home = teamOfTournament(input.home_team_id, tournamentId)
  const away = teamOfTournament(input.away_team_id, tournamentId)
  if (home.id === away.id) invalid('Команда не может играть сама с собой')
  if (typeof input.starts_at !== 'string' || Number.isNaN(Date.parse(input.starts_at))) invalid('Укажите дату и время')
  const roundId = input.round_id ?? null
  if (roundId !== null) {
    const round = db.rounds.find((r) => r.id === roundId)
    if (!round || round.tournament_id !== tournamentId) invalid('Тур не из этого турнира')
    if (round.closed_at !== null) conflict('Тур уже закрыт — добавить в него матч нельзя')
  }
  return {
    home_team_id: home.id,
    away_team_id: away.id,
    starts_at: input.starts_at,
    venue: optionalText(input.venue, 'Место — строкой'),
    round_id: roundId,
  }
}

export function createMatch(tournamentId: number, body: unknown): Match {
  findTournament(tournamentId)
  const row: MatchRow = {
    id: nextId(db.matches),
    tournament_id: tournamentId,
    status: 'scheduled',
    ...validateMatch(tournamentId, (body ?? {}) as Partial<MatchInput>),
  }
  db.matches.push(row)
  return toMatch(row)
}

function hasEvents(matchId: number): boolean {
  return db.events.some((e) => e.match_id === matchId)
}

export function updateMatch(id: number, body: unknown): Match {
  const row = findMatch(id)
  const fields = validateMatch(row.tournament_id, { ...row, ...(body as Partial<MatchInput>) })
  const teamsChanged = fields.home_team_id !== row.home_team_id || fields.away_team_id !== row.away_team_id
  if (teamsChanged && hasEvents(id)) conflict('У матча уже есть события — команды поменять нельзя')
  Object.assign(row, fields)
  return toMatch(row)
}

export function deleteMatch(id: number): void {
  const row = findMatch(id)
  if (hasEvents(id)) conflict('У матча уже есть события — удалить его нельзя, сначала отмените')
  db.matches.splice(db.matches.indexOf(row), 1)
  db.statusLog = db.statusLog.filter((e) => e.match_id !== id)
  db.votes = db.votes.filter((v) => v.match_id !== id)
}

// ---------- Команды и игроки ----------

function removeFromLineups(playerIds: Set<number>): void {
  db.lineups.forEach((lineup) => {
    lineup.player_ids = lineup.player_ids.filter((id) => !playerIds.has(id))
  })
}

export function updateTeam(id: number, body: unknown): Team {
  const team = findTeam(id)
  const input = { ...team, ...(body as TeamUpdate) }
  const name = nonEmpty(input.name, 'Укажите название команды')
  const sameName = db.teams.find((t) => t.tournament_id === team.tournament_id && t.name === name && t.id !== id)
  if (sameName) conflict('Команда с таким названием в турнире уже есть')
  team.name = name
  team.logo_url = optionalText(input.logo_url, 'Логотип — ссылкой')
  return toTeam(team)
}

export function deleteTeam(id: number): void {
  const team = findTeam(id)
  if (db.matches.some((m) => m.home_team_id === id || m.away_team_id === id)) {
    conflict('У команды есть матчи — сначала удалите их из календаря')
  }
  const playerIds = new Set(db.players.filter((p) => p.team_id === id).map((p) => p.id))
  db.players = db.players.filter((p) => !playerIds.has(p.id))
  removeFromLineups(playerIds)
  db.teams.splice(db.teams.indexOf(team), 1)
}

export function updatePlayer(id: number, body: unknown): Player {
  const player = findPlayer(id)
  const input = { ...player, ...(body as PlayerUpdate) }
  const fullName = nonEmpty(input.full_name, 'Укажите имя игрока')
  const number = input.number ?? null
  if (number !== null && (!Number.isInteger(number) || number < 0 || number > 99)) invalid('Номер — от 0 до 99')
  if (number !== null && db.players.some((p) => p.team_id === player.team_id && p.number === number && p.id !== id)) {
    conflict(`Номер ${number} в команде уже занят`)
  }
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0) {
    invalid('Цена — положительное число')
  }
  Object.assign(player, {
    full_name: fullName,
    number,
    position: optionalText(input.position, 'Позиция — строкой'),
    photo_url: optionalText(input.photo_url, 'Фото — ссылкой'),
    price: input.price,
  })
  return toPlayer(player)
}

export function deletePlayer(id: number): void {
  const player = findPlayer(id)
  if (db.events.some((e) => e.player_id === id || e.assist_player_id === id)) {
    conflict('У игрока есть события в матчах — удалить его нельзя')
  }
  if (db.pointsEntries.some((p) => p.player_id === id)) {
    conflict('Игроку уже начислены фэнтези-очки — удалить его нельзя')
  }
  db.players.splice(db.players.indexOf(player), 1)
  removeFromLineups(new Set([id]))
  db.votes = db.votes.filter((v) => v.player_id !== id)
}
