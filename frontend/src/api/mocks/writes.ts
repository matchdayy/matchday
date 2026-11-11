// Запись в моках: экран оператора меняет состояние в памяти, и остальные экраны
// сразу видят новый счёт, таблицу и статистику.
// Проверки повторяют ограничения базы на бэкенде, чтобы ошибки всплывали ещё на моках.

import { ApiError } from '../client'
import type { EventType, EventUpdate, Match, MatchEvent, MatchStatus, NewEvent } from '../types'
import { db, findEvent, findMatch, findPlayer, invalid, type EventRow, type MatchRow } from './db'
import { matchClock, toMatch, toMatchEvent } from './views'

const EVENT_TYPES: EventType[] = ['goal', 'yellow_card', 'red_card']

const ALLOWED_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  scheduled: ['live', 'cancelled'],
  live: ['paused', 'finished'],
  paused: ['live', 'finished'],
  finished: [],
  cancelled: [],
}

function playerOfMatch(playerId: unknown, match: MatchRow) {
  if (typeof playerId !== 'number') invalid('Не указан игрок')
  const player = findPlayer(playerId)
  if (player.team_id !== match.home_team_id && player.team_id !== match.away_team_id) {
    invalid('Игрок не играет в этом матче')
  }
  return player
}

type EventFields = Omit<EventRow, 'id' | 'match_id' | 'client_id'>

// Общие проверки для нового и исправленного события.
function validateEvent(match: MatchRow, input: Partial<NewEvent>, minute: unknown): EventFields {
  if (!input.type || !EVENT_TYPES.includes(input.type)) invalid('Неизвестный тип события')
  if (typeof minute !== 'number' || !Number.isInteger(minute) || minute < 0 || minute > 150) {
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

  return { type: input.type, minute, player_id: player.id, assist_player_id: assistId, is_own_goal: isOwnGoal }
}

export function addEvent(matchId: number, body: unknown): MatchEvent {
  const match = findMatch(matchId)
  const input = (body ?? {}) as Partial<NewEvent>

  // Телефон оператора прислал событие повторно после потери связи — отдаём уже созданное.
  // На бэкенде это ответ 200 вместо 201; fetch-обёртке разница не видна.
  const clientId = input.client_id ?? null
  const duplicate = clientId === null ? undefined : db.events.find((e) => e.client_id === clientId)
  if (duplicate) return toMatchEvent(duplicate)

  if (match.status !== 'live' && match.status !== 'paused') {
    throw new ApiError(409, 'События можно добавлять, только пока матч идёт или на перерыве')
  }

  // Минуту не прислали — подставляем по игровому времени.
  const minute = input.minute ?? matchClock(match)?.minute
  const row: EventRow = {
    id: db.nextEventId++,
    match_id: match.id,
    client_id: clientId,
    ...validateEvent(match, input, minute),
  }
  db.events.push(row)
  return toMatchEvent(row)
}

export function updateEvent(eventId: number, body: unknown): MatchEvent {
  const event = findEvent(eventId)
  const match = findMatch(event.match_id)
  const patch = (body ?? {}) as EventUpdate
  // Поля, которых нет в теле, остаются прежними.
  const merged: Partial<NewEvent> = {
    type: event.type,
    player_id: event.player_id,
    assist_player_id: event.assist_player_id,
    is_own_goal: event.is_own_goal,
    ...patch,
  }
  Object.assign(event, validateEvent(match, merged, patch.minute ?? event.minute))
  return toMatchEvent(event)
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
  db.statusLog.push({ match_id: match.id, status, at: new Date().toISOString() })
  return toMatch(match)
}
