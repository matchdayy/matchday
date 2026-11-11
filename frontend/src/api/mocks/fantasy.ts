// Фэнтези в моках: те же правила, что на бэкенде в backend/app/services/fantasy/rules.py.
// Очки начисляются только при закрытии тура (awardRoundPoints) и потом не пересчитываются:
// правка событий после закрытия меняет счёт, но не журнал очков.

import { ApiError } from '../client'
import type {
  FantasyLeague,
  FantasyPlayer,
  FantasyRules,
  FantasyTeam,
  Lineup,
  PointsEntry,
  PointsReason,
  RatingRow,
} from '../types'
import {
  conflict,
  db,
  findFantasyTeam,
  findLeague,
  findPlayer,
  findRound,
  findTeam,
  findTournament,
  invalid,
  nextId,
  type FantasyTeamRow,
  type LineupRow,
  type PlayerRow,
  type RoundRow,
  type UserRow,
} from './db'
import { eventsOfMatch, toPlayerShort, toTeamShort } from './views'

export const FANTASY_RULES: FantasyRules = {
  squad_size: 5,
  budget: 50,
  max_per_team: 2,
  points: { goal: 4, assist: 3, played: 1, yellow_card: -1, red_card: -3, own_goal: -2 },
}

// ---------- Игроки и команды ----------

function playersOfTournament(tournamentId: number): PlayerRow[] {
  const teamIds = new Set(db.teams.filter((t) => t.tournament_id === tournamentId).map((t) => t.id))
  return db.players.filter((p) => teamIds.has(p.team_id))
}

export function toFantasyPlayer(player: PlayerRow): FantasyPlayer {
  return { ...toPlayerShort(player), team: toTeamShort(findTeam(player.team_id)), price: player.price }
}

export function fantasyPlayers(tournamentId: number): FantasyPlayer[] {
  return playersOfTournament(findTournament(tournamentId).id).map(toFantasyPlayer)
}

export function toFantasyTeam(team: FantasyTeamRow): FantasyTeam {
  const owner = db.users.find((u) => u.id === team.owner_id)
  return {
    id: team.id,
    name: team.name,
    tournament_id: team.tournament_id,
    owner: { id: team.owner_id, display_name: owner?.display_name ?? 'Удалённый пользователь' },
  }
}

function teamOfUser(user: UserRow, tournamentId: number): FantasyTeamRow | undefined {
  return db.fantasyTeams.find((t) => t.owner_id === user.id && t.tournament_id === tournamentId)
}

function requireTeamOfUser(user: UserRow, tournamentId: number): FantasyTeamRow {
  const team = teamOfUser(user, tournamentId)
  if (!team) conflict('Сначала создайте фэнтези-команду в этом турнире')
  return team
}

function requireName(body: unknown): string {
  const name = (body as { name?: unknown } | undefined)?.name
  if (typeof name !== 'string' || !name.trim()) invalid('Укажите название')
  if (name.trim().length > 60) invalid('Название — не длиннее 60 символов')
  return name.trim()
}

export function myFantasyTeam(user: UserRow, tournamentId: number): FantasyTeam {
  findTournament(tournamentId)
  const team = teamOfUser(user, tournamentId)
  if (!team) throw new ApiError(404, 'Фэнтези-команда ещё не создана')
  return toFantasyTeam(team)
}

export function createFantasyTeam(user: UserRow, tournamentId: number, body: unknown): FantasyTeam {
  findTournament(tournamentId)
  const name = requireName(body)
  if (teamOfUser(user, tournamentId)) conflict('Фэнтези-команда в этом турнире у вас уже есть')
  const team: FantasyTeamRow = { id: nextId(db.fantasyTeams), tournament_id: tournamentId, owner_id: user.id, name }
  db.fantasyTeams.push(team)
  return toFantasyTeam(team)
}

// ---------- Составы ----------

function isLocked(round: RoundRow): boolean {
  return round.closed_at !== null || Date.now() >= Date.parse(round.deadline)
}

function toLineup(row: LineupRow, round: RoundRow): Lineup {
  const players = row.player_ids.map((id) => toFantasyPlayer(findPlayer(id)))
  return {
    round_id: row.round_id,
    players,
    total_price: players.reduce((sum, p) => sum + p.price, 0),
    locked: isLocked(round),
  }
}

export function myLineup(user: UserRow, roundId: number): Lineup {
  const round = findRound(roundId)
  const team = teamOfUser(user, round.tournament_id)
  const row = team && db.lineups.find((l) => l.fantasy_team_id === team.id && l.round_id === round.id)
  if (!row) throw new ApiError(404, 'Состава на этот тур нет')
  return toLineup(row, round)
}

// Проверки состава. Отдельно от сохранения — ими же seed.ts проверяет демо-составы.
export function validateLineup(tournamentId: number, playerIds: unknown): number[] {
  const { squad_size, budget, max_per_team } = FANTASY_RULES
  if (!Array.isArray(playerIds) || !playerIds.every((id) => Number.isInteger(id))) invalid('Нужен список id игроков')
  if (new Set(playerIds).size !== playerIds.length) invalid('Один игрок выбран дважды')
  if (playerIds.length !== squad_size) invalid(`В составе должно быть ${squad_size} игроков, выбрано ${playerIds.length}`)

  const allowed = new Map(playersOfTournament(tournamentId).map((p) => [p.id, p]))
  const players = playerIds.map((id: number) => allowed.get(id) ?? invalid(`Игрок ${id} не из этого турнира`))

  const total = players.reduce((sum, p) => sum + p.price, 0)
  if (total > budget) invalid(`Бюджет превышен: ${total} из ${budget}`)

  const perTeam = new Map<number, number>()
  players.forEach((p) => perTeam.set(p.team_id, (perTeam.get(p.team_id) ?? 0) + 1))
  for (const [teamId, count] of perTeam) {
    if (count > max_per_team) {
      invalid(`Из команды «${findTeam(teamId).name}» можно взять не больше ${max_per_team} игроков, выбрано ${count}`)
    }
  }
  return playerIds
}

export function saveLineupRow(fantasyTeamId: number, roundId: number, playerIds: number[]): LineupRow {
  const existing = db.lineups.find((l) => l.fantasy_team_id === fantasyTeamId && l.round_id === roundId)
  if (existing) {
    existing.player_ids = playerIds
    return existing
  }
  const row = { fantasy_team_id: fantasyTeamId, round_id: roundId, player_ids: playerIds }
  db.lineups.push(row)
  return row
}

export function saveMyLineup(user: UserRow, roundId: number, body: unknown): Lineup {
  const round = findRound(roundId)
  const team = requireTeamOfUser(user, round.tournament_id)
  if (isLocked(round)) conflict('Дедлайн тура прошёл — состав больше нельзя менять')
  const playerIds = validateLineup(round.tournament_id, (body as { player_ids?: unknown } | undefined)?.player_ids)
  return toLineup(saveLineupRow(team.id, round.id, playerIds), round)
}

// ---------- Начисление очков при закрытии тура ----------

// Состав на тур, а если его не прислали — последний из прошлых туров.
function lineupForRound(teamId: number, round: RoundRow): LineupRow | undefined {
  const numberOf = (roundId: number) => db.rounds.find((r) => r.id === roundId)?.number ?? -1
  return db.lineups
    .filter((l) => l.fantasy_team_id === teamId && numberOf(l.round_id) <= round.number)
    .sort((a, b) => numberOf(b.round_id) - numberOf(a.round_id))[0]
}

type Award = { player_id: number; reason: PointsReason; match_id: number; event_id: number | null; minute: number | null }

// За что игрок получает очки в одном завершённом матче.
function awardsInMatch(playerId: number, matchId: number): Award[] {
  const awards: Award[] = [{ player_id: playerId, reason: 'played', match_id: matchId, event_id: null, minute: null }]
  for (const event of eventsOfMatch(matchId)) {
    const base = { player_id: playerId, match_id: matchId, event_id: event.id, minute: event.minute }
    if (event.assist_player_id === playerId) awards.push({ ...base, reason: 'assist' })
    if (event.player_id !== playerId) continue
    if (event.type === 'goal') awards.push({ ...base, reason: event.is_own_goal ? 'own_goal' : 'goal' })
    else awards.push({ ...base, reason: event.type })
  }
  return awards
}

export function awardRoundPoints(round: RoundRow): void {
  const finishedMatches = db.matches.filter((m) => m.round_id === round.id && m.status === 'finished')
  for (const team of db.fantasyTeams.filter((t) => t.tournament_id === round.tournament_id)) {
    const lineup = lineupForRound(team.id, round)
    for (const playerId of lineup?.player_ids ?? []) {
      const player = db.players.find((p) => p.id === playerId)
      const matches = finishedMatches.filter((m) => m.home_team_id === player?.team_id || m.away_team_id === player?.team_id)
      for (const award of matches.flatMap((m) => awardsInMatch(playerId, m.id))) {
        db.pointsEntries.push({
          id: nextId(db.pointsEntries),
          fantasy_team_id: team.id,
          round_id: round.id,
          points: FANTASY_RULES.points[award.reason],
          ...award,
        })
      }
    }
  }
}

// ---------- Рейтинг и журнал очков ----------

function sumPoints(teamId: number, roundId?: number): number {
  return db.pointsEntries
    .filter((p) => p.fantasy_team_id === teamId && (roundId === undefined || p.round_id === roundId))
    .reduce((sum, p) => sum + p.points, 0)
}

function lastClosedRound(tournamentId: number): RoundRow | undefined {
  return db.rounds
    .filter((r) => r.tournament_id === tournamentId && r.closed_at !== null)
    .sort((a, b) => b.number - a.number)[0]
}

function buildRating(teams: FantasyTeamRow[], tournamentId: number): RatingRow[] {
  const lastRound = lastClosedRound(tournamentId)
  return teams
    .map((team) => ({
      position: 0,
      fantasy_team: toFantasyTeam(team),
      points: sumPoints(team.id),
      last_round_points: lastRound ? sumPoints(team.id, lastRound.id) : 0,
    }))
    .sort((a, b) => b.points - a.points || a.fantasy_team.name.localeCompare(b.fantasy_team.name, 'ru'))
    .map((row, index) => ({ ...row, position: index + 1 }))
}

export function tournamentRating(tournamentId: number): RatingRow[] {
  findTournament(tournamentId)
  return buildRating(
    db.fantasyTeams.filter((t) => t.tournament_id === tournamentId),
    tournamentId,
  )
}

export function leagueRating(leagueId: number): RatingRow[] {
  const league = findLeague(leagueId)
  const members = db.fantasyTeams.filter((t) => league.member_team_ids.includes(t.id))
  return buildRating(members, league.tournament_id)
}

export function teamPoints(teamId: number, roundIdParam: string | null): PointsEntry[] {
  findFantasyTeam(teamId)
  const roundId = roundIdParam === null ? undefined : Number(roundIdParam)
  return db.pointsEntries
    .filter((p) => p.fantasy_team_id === teamId && (roundId === undefined || p.round_id === roundId))
    .map((p) => ({
      id: p.id,
      round_id: p.round_id,
      player: toPlayerShort(findPlayer(p.player_id)),
      points: p.points,
      reason: p.reason,
      match_id: p.match_id,
      event_id: p.event_id,
      minute: p.minute,
    }))
}

// ---------- Лиги ----------

function toLeague(league: (typeof db.leagues)[number], user: UserRow | null): FantasyLeague {
  const myTeam = user ? teamOfUser(user, league.tournament_id) : undefined
  const isMember = !!myTeam && league.member_team_ids.includes(myTeam.id)
  return {
    id: league.id,
    name: league.name,
    tournament_id: league.tournament_id,
    invite_code: isMember ? league.invite_code : null,
    members_count: league.member_team_ids.length,
  }
}

export function myLeagues(user: UserRow, tournamentId: number): FantasyLeague[] {
  findTournament(tournamentId)
  const team = teamOfUser(user, tournamentId)
  if (!team) return []
  return db.leagues
    .filter((l) => l.tournament_id === tournamentId && l.member_team_ids.includes(team.id))
    .map((l) => toLeague(l, user))
}

// Код без похожих символов (0/O, 1/I), чтобы его было легко продиктовать.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newInviteCode(): string {
  let code = ''
  do {
    code = Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
  } while (db.leagues.some((l) => l.invite_code === code))
  return code
}

export function createLeague(user: UserRow, tournamentId: number, body: unknown): FantasyLeague {
  findTournament(tournamentId)
  const name = requireName(body)
  const team = requireTeamOfUser(user, tournamentId)
  const league = { id: nextId(db.leagues), tournament_id: tournamentId, name, invite_code: newInviteCode(), member_team_ids: [team.id] }
  db.leagues.push(league)
  return toLeague(league, user)
}

export function joinLeague(user: UserRow, body: unknown): FantasyLeague {
  const code = (body as { invite_code?: unknown } | undefined)?.invite_code
  const league = typeof code === 'string' ? db.leagues.find((l) => l.invite_code === code.trim().toUpperCase()) : undefined
  if (!league) throw new ApiError(404, 'Лиги с таким кодом нет')
  const team = requireTeamOfUser(user, league.tournament_id)
  if (!league.member_team_ids.includes(team.id)) league.member_team_ids.push(team.id)
  return toLeague(league, user)
}
