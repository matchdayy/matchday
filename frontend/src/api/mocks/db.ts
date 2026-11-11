// «База данных» моков: строки в том же виде, что таблицы на бэкенде.
// Собирается из demo.json — копии backend/fixtures/demo.json (контейнер фронтенда
// видит только папку frontend/, поэтому файл лежит здесь).
// id раздаются по порядку записей в фикстуре — так же их раздаст загрузчик
// в настоящую базу, и ссылки вида /matches/4 совпадут.
// Состояние живёт в памяти: после перезагрузки страницы всё возвращается к фикстуре.

import { ApiError } from '../client'
import type { EventType, MatchStatus } from '../types'
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
}
export type MatchRow = {
  id: number
  tournament_id: number
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
}

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

const tournaments: TournamentRow[] = [{ id: DEMO_TOURNAMENT_ID, ...demo.tournament }, ...EXTRA_TOURNAMENTS]
const teams: TeamRow[] = []
const players: PlayerRow[] = []
const matches: MatchRow[] = []
const events: EventRow[] = []

demo.teams.forEach((team) => {
  const teamId = teams.length + 1
  teams.push({ id: teamId, tournament_id: DEMO_TOURNAMENT_ID, name: team.name, logo_url: null })
  team.players.forEach((player) => {
    players.push({ id: players.length + 1, team_id: teamId, photo_url: null, ...player })
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
    })
  })
})

export const db = { tournaments, teams, players, matches, events, nextEventId: events.length + 1 }

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
