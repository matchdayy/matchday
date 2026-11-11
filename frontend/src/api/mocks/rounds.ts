// Туры в моках: список, правка администратором и закрытие с начислением фэнтези-очков.

import type { Round, RoundInput } from '../types'
import { conflict, db, findRound, findTournament, invalid, nextId, type RoundRow } from './db'
import { awardRoundPoints } from './fantasy'

export function toRound(round: RoundRow): Round {
  return { ...round }
}

export function tournamentRounds(tournamentId: number): Round[] {
  findTournament(tournamentId)
  return db.rounds
    .filter((r) => r.tournament_id === tournamentId)
    .sort((a, b) => a.number - b.number)
    .map(toRound)
}

function validateRound(tournamentId: number, input: Partial<RoundInput>, selfId: number | null): RoundInput {
  if (!Number.isInteger(input.number) || input.number! < 1) invalid('Номер тура — целое число от 1')
  if (typeof input.title !== 'string' || !input.title.trim()) invalid('Укажите название тура')
  if (typeof input.deadline !== 'string' || Number.isNaN(Date.parse(input.deadline))) invalid('Укажите дедлайн')
  const sameNumber = db.rounds.find((r) => r.tournament_id === tournamentId && r.number === input.number && r.id !== selfId)
  if (sameNumber) conflict(`Тур с номером ${input.number} уже есть`)
  return { number: input.number!, title: input.title.trim(), deadline: input.deadline }
}

export function createRound(tournamentId: number, body: unknown): Round {
  findTournament(tournamentId)
  const fields = validateRound(tournamentId, (body ?? {}) as Partial<RoundInput>, null)
  const round: RoundRow = { id: nextId(db.rounds), tournament_id: tournamentId, closed_at: null, ...fields }
  db.rounds.push(round)
  return toRound(round)
}

export function updateRound(roundId: number, body: unknown): Round {
  const round = findRound(roundId)
  if (round.closed_at !== null) conflict('Тур уже закрыт, его нельзя менять')
  Object.assign(round, validateRound(round.tournament_id, { ...round, ...(body as Partial<RoundInput>) }, round.id))
  return toRound(round)
}

export function deleteRound(roundId: number): void {
  const round = findRound(roundId)
  if (round.closed_at !== null) conflict('Тур уже закрыт: по нему начислены очки, удалить его нельзя')
  if (db.matches.some((m) => m.round_id === round.id)) conflict('В туре есть матчи — сначала перенесите их в другой тур')
  db.rounds.splice(db.rounds.indexOf(round), 1)
  db.lineups = db.lineups.filter((l) => l.round_id !== round.id)
}

// Повторное закрытие ничего не пересчитывает и отдаёт тот же тур.
export function closeRound(roundId: number, closedAt = new Date().toISOString()): Round {
  const round = findRound(roundId)
  if (round.closed_at !== null) return toRound(round)
  const unfinished = db.matches.filter(
    (m) => m.round_id === round.id && m.status !== 'finished' && m.status !== 'cancelled',
  )
  if (unfinished.length > 0) {
    conflict(`Не все матчи тура завершены или отменены: осталось ${unfinished.length}`)
  }
  awardRoundPoints(round)
  round.closed_at = closedAt
  return toRound(round)
}
