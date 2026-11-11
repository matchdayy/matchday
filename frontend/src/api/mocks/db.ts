// «База данных» моков: строки в том же виде, что таблицы на бэкенде.
// Собирается из demo.json — копии backend/fixtures/demo.json (контейнер фронтенда
// видит только папку frontend/, поэтому файл лежит здесь).
// id раздаются по порядку записей в фикстуре — так же их раздаст загрузчик
// в настоящую базу, и ссылки вида /matches/4 совпадут.
// Состояние живёт в памяти: после перезагрузки страницы всё возвращается к фикстуре.
// Пользователи, туры, цены и журнал статусов есть только в моках — их задаёт этот файл,
// фэнтези-команды, лиги и голоса — seed.ts.

import { ApiError } from '../client'
import type { EventType, MatchStatus, PointsReason, Role } from '../types'
import demo from './demo.json'

export type TournamentRow = { id: number; name: string; sport: string; start_date: string; end_date: string }
export type TeamRow = { id: number; tournament_id: number; name: string; logo_url: string | null }
export type PlayerRow = {
  id: number
  team_id: number
  full_name: string
  number: number | null
  position: string | null
  photo_url: string | null
  price: number
}
export type MatchRow = {
  id: number
  tournament_id: number
  round_id: number | null
  home_team_id: number
  away_team_id: number
  starts_at: string
  venue: string | null
  status: MatchStatus
}
export type EventRow = {
  id: number
  match_id: number
  type: EventType
  minute: number
  player_id: number
  assist_player_id: number | null
  is_own_goal: boolean
  client_id: string | null
}
// Каждая смена статуса матча с моментом времени: по журналу считается игровое время.
export type StatusLogRow = { match_id: number; status: MatchStatus; at: string }
export type UserRow = {
  id: number
  email: string
  password: string // только в моках; настоящий бэкенд хранит хеш
  display_name: string
  role: Role
  pd_consent_at: string
}
export type RoundRow = {
  id: number
  tournament_id: number
  number: number
  title: string
  deadline: string
  closed_at: string | null
}
export type FantasyTeamRow = { id: number; tournament_id: number; owner_id: number; name: string }
export type LineupRow = { fantasy_team_id: number; round_id: number; player_ids: number[] }
export type PointsEntryRow = {
  id: number
  fantasy_team_id: number
  round_id: number
  player_id: number
  points: number
  reason: PointsReason
  match_id: number
  event_id: number | null
  minute: number | null
}
export type LeagueRow = {
  id: number
  tournament_id: number
  name: string
  invite_code: string
  member_team_ids: number[]
}
export type VoteRow = { match_id: number; user_id: number; player_id: number }

// В фикстуре один турнир. Ещё два пустых есть только в моках — чтобы на экранах
// были видны все статусы турнира и состояние «матчей пока нет».
const EXTRA_TOURNAMENTS: TournamentRow[] = [
  { id: 2, name: 'Весенний кубок ITMO', sport: 'football', start_date: '2026-03-02', end_date: '2026-04-20' },
  { id: 3, name: 'Зимний турнир по баскетболу', sport: 'basketball', start_date: '2027-02-01', end_date: '2027-03-15' },
]

// В фикстуре у матчей нет площадки. Части матчей она задана, чтобы были видны оба случая.
const MOCK_VENUES: Record<number, string> = {
  1: 'Спортзал корпуса А',
  2: 'Спортзал корпуса Б',
  4: 'Спортзал корпуса А',
}

const DEMO_TOURNAMENT_ID = 1

// Демо-пользователи моков. Пароль у всех — demo. Регистрация в моках тоже работает,
// но новые пользователи пропадают после перезагрузки страницы.
const DEMO_PASSWORD = 'demo'
const DEMO_USERS: UserRow[] = [
  { id: 1, email: 'viewer@demo.local', display_name: 'Демо-зритель', role: 'viewer' },
  { id: 2, email: 'operator@demo.local', display_name: 'Демо-оператор', role: 'operator' },
  { id: 3, email: 'admin@demo.local', display_name: 'Демо-администратор', role: 'admin' },
].map((user) => ({ ...user, role: user.role as Role, password: DEMO_PASSWORD, pd_consent_at: '2026-11-01T10:00:00Z' }))

// Цены игроков в фикстуре нет. Считаем от позиции с небольшим разбросом: 7–14 при бюджете 50,
// так что на пятерых дорогих не хватит и придётся выбирать.
const BASE_PRICE: Record<string, number> = { GK: 7, DEF: 8, MID: 10, FWD: 12 }
function mockPrice(playerId: number, position: string | null): number {
  return (BASE_PRICE[position ?? ''] ?? 8) + (playerId % 3)
}

// Туры демо-турнира: первый уже закрыт (его закрывает seed.ts, чтобы появился журнал очков),
// второй открыт. Даты считаются от момента загрузки, как и журнал статусов ниже:
// матчи первого тура закончились 14 и 7 дней назад, а дедлайн второго — через 3 дня,
// чтобы состав всегда можно было поменять, когда бы вы ни открыли моки.
export const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
export const LOADED_AT = Date.now()

const ROUNDS: RoundRow[] = [
  {
    id: 1,
    tournament_id: DEMO_TOURNAMENT_ID,
    number: 1,
    title: 'Тур 1',
    deadline: new Date(LOADED_AT - 15 * DAY_MS).toISOString(),
    closed_at: null,
  },
  {
    id: 2,
    tournament_id: DEMO_TOURNAMENT_ID,
    number: 2,
    title: 'Тур 2',
    deadline: new Date(LOADED_AT + 3 * DAY_MS).toISOString(),
    closed_at: null,
  },
]
// Матчи 1–2 — первый тур, 3–6 — второй.
const roundOfMatch = (matchId: number) => (matchId <= 2 ? 1 : 2)

const tournaments: TournamentRow[] = [{ id: DEMO_TOURNAMENT_ID, ...demo.tournament }, ...EXTRA_TOURNAMENTS]
const teams: TeamRow[] = []
const players: PlayerRow[] = []
const matches: MatchRow[] = []
const events: EventRow[] = []

demo.teams.forEach((team) => {
  const teamId = teams.length + 1
  teams.push({ id: teamId, tournament_id: DEMO_TOURNAMENT_ID, name: team.name, logo_url: null })
  team.players.forEach((player) => {
    const playerId = players.length + 1
    players.push({ id: playerId, team_id: teamId, photo_url: null, price: mockPrice(playerId, player.position), ...player })
  })
})

function teamIdByName(name: string): number {
  const team = teams.find((t) => t.name === name)
  if (!team) throw new Error(`demo.json: нет команды ${name}`)
  return team.id
}

function playerIdByName(name: string, teamIds: number[]): number {
  const player = players.find((p) => p.full_name === name && teamIds.includes(p.team_id))
  if (!player) throw new Error(`demo.json: нет игрока ${name}`)
  return player.id
}

demo.matches.forEach((match) => {
  const matchId = matches.length + 1
  const teamIds = [teamIdByName(match.home), teamIdByName(match.away)]
  matches.push({
    id: matchId,
    tournament_id: DEMO_TOURNAMENT_ID,
    round_id: roundOfMatch(matchId),
    home_team_id: teamIds[0],
    away_team_id: teamIds[1],
    starts_at: match.starts_at,
    venue: MOCK_VENUES[matchId] ?? null,
    status: match.status as MatchStatus,
  })
  match.events.forEach((event) => {
    events.push({
      id: events.length + 1,
      match_id: matchId,
      type: event.type as EventType,
      minute: event.minute,
      player_id: playerIdByName(event.player, teamIds),
      assist_player_id: 'assist' in event && event.assist ? playerIdByName(event.assist, teamIds) : null,
      is_own_goal: false,
      client_id: null,
    })
  })
})

// Журнал статусов для матчей фикстуры. Время — относительно загрузки моков:
// так у только что завершённого матча голосование ещё открыто, а у давнего уже закрыто.
function logEntry(matchId: number, status: MatchStatus, msAgo: number): StatusLogRow {
  return { match_id: matchId, status, at: new Date(LOADED_AT - msAgo).toISOString() }
}

// 45 минут, перерыв 15, ещё 45 — итого 90 минут игрового времени.
function playedMatchLog(matchId: number, finishedMsAgo: number): StatusLogRow[] {
  const start = finishedMsAgo + 105 * MINUTE_MS
  return [
    logEntry(matchId, 'live', start),
    logEntry(matchId, 'paused', start - 45 * MINUTE_MS),
    logEntry(matchId, 'live', start - 60 * MINUTE_MS),
    logEntry(matchId, 'finished', finishedMsAgo),
  ]
}

const FINISHED_MS_AGO: Record<number, number> = { 1: 14 * DAY_MS, 2: 7 * DAY_MS, 3: 60 * MINUTE_MS }

const statusLog: StatusLogRow[] = matches.flatMap((match) => {
  if (match.status === 'finished') return playedMatchLog(match.id, FINISHED_MS_AGO[match.id] ?? DAY_MS)
  // Идущий матч: первый тайм 20 минут, перерыв 10 минут, второй тайм идёт уже 20 минут.
  // На часах 40 минут игрового времени, а не 50 — перерыв не считается.
  if (match.status === 'live') {
    return [
      logEntry(match.id, 'live', 50 * MINUTE_MS),
      logEntry(match.id, 'paused', 30 * MINUTE_MS),
      logEntry(match.id, 'live', 20 * MINUTE_MS),
    ]
  }
  return []
})

export const db = {
  tournaments,
  teams,
  players,
  matches,
  events,
  nextEventId: events.length + 1,
  statusLog,
  users: DEMO_USERS,
  rounds: ROUNDS,
  fantasyTeams: [] as FantasyTeamRow[],
  lineups: [] as LineupRow[],
  pointsEntries: [] as PointsEntryRow[],
  leagues: [] as LeagueRow[],
  votes: [] as VoteRow[],
}

// Следующий свободный id в таблице.
export function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1
}

function findOr404<T extends { id: number }>(rows: T[], id: number, detail: string): T {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new ApiError(404, detail)
  return row
}

export const findTournament = (id: number) => findOr404(db.tournaments, id, 'Турнир не найден')
export const findTeam = (id: number) => findOr404(db.teams, id, 'Команда не найдена')
export const findPlayer = (id: number) => findOr404(db.players, id, 'Игрок не найден')
export const findMatch = (id: number) => findOr404(db.matches, id, 'Матч не найден')
export const findEvent = (id: number) => findOr404(db.events, id, 'Событие не найдено')
export const findRound = (id: number) => findOr404(db.rounds, id, 'Тур не найден')
export const findUser = (id: number) => findOr404(db.users, id, 'Пользователь не найден')
export const findFantasyTeam = (id: number) => findOr404(db.fantasyTeams, id, 'Фэнтези-команда не найдена')
export const findLeague = (id: number) => findOr404(db.leagues, id, 'Лига не найдена')

export function invalid(detail: string): never {
  throw new ApiError(422, detail)
}

export function conflict(detail: string): never {
  throw new ApiError(409, detail)
}
