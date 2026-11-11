// Запись в моках: экран оператора меняет состояние в памяти, и остальные экраны
// сразу видят новый счёт, таблицу и статистику.
// Проверки повторяют ограничения базы на бэкенде, чтобы ошибки всплывали ещё на моках.

import { ApiError } from '../client'
import type { EventType, Match, MatchEvent, MatchStatus, NewEvent } from '../types'
import { db, findEvent, findMatch, findPlayer, type MatchRow } from './db'
import { toMatch, toMatchEvent } from './views'

const EVENT_TYPES: EventType[] = ['goal', 'yellow_card', 'red_card']

const ALLOWED_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  scheduled: ['live', 'cancelled'],
  live: ['paused', 'finished'],
  paused: ['live', 'finished'],
  finished: [],
  cancelled: [],
}

function invalid(detail: string): never {
  throw new ApiError(422, detail)
}

function playerOfMatch(playerId: unknown, match: MatchRow) {
  if (typeof playerId !== 'number') invalid('Не указан игрок')
  const player = findPlayer(playerId)
  if (player.team_id !== match.home_team_id && player.team_id !== match.away_team_id) {
    invalid('Игрок не играет в этом матче')
  }
  return player
}

export function addEvent(matchId: number, body: unknown): MatchEvent {
  const match = findMatch(matchId)
  if (match.status !== 'live' && match.status !== 'paused') {
    throw new ApiError(409, 'События можно добавлять, только пока матч идёт или на перерыве')
  }

  const input = (body ?? {}) as Partial<NewEvent>
  if (!input.type || !EVENT_TYPES.includes(input.type)) invalid('Неизвестный тип события')
  if (!Number.isInteger(input.minute) || input.minute! < 0 || input.minute! > 150) {
    invalid('Минута должна быть от 0 до 150')
  }
  const player = playerOfMatch(input.player_id, match)
  const isOwnGoal = input.is_own_goal ?? false
  const assistId = input.assist_player_id ?? null

  if (isOwnGoal && input.type !== 'goal') invalid('Автоголом может быть только гол')
  if (assistId !== null) {
    if (input.type !== 'goal' || isOwnGoal) invalid('Передача бывает только у гола, и не у автогола')
    if (assistId === player.id) invalid('Игрок не может отдать передачу сам себе')
    if (playerOfMatch(assistId, match).team_id !== player.team_id) invalid('Ассистент должен быть из команды забившего')
  }

  const row = {
    id: db.nextEventId++,
    match_id: match.id,
    type: input.type,
    minute: input.minute!,
    player_id: player.id,
    assist_player_id: assistId,
    is_own_goal: isOwnGoal,
  }
  db.events.push(row)
  return toMatchEvent(row)
}

export function deleteEvent(eventId: number): void {
  const event = findEvent(eventId)
  db.events.splice(db.events.indexOf(event), 1)
}

export function changeStatus(matchId: number, body: unknown): Match {
  const match = findMatch(matchId)
  const status = (body as { status?: MatchStatus } | undefined)?.status
  if (!status || !(status in ALLOWED_TRANSITIONS)) invalid('Неизвестный статус матча')
  if (!ALLOWED_TRANSITIONS[match.status].includes(status)) {
    throw new ApiError(409, `Нельзя перевести матч из статуса «${match.status}» в «${status}»`)
  }
  match.status = status
  return toMatch(match)
}
