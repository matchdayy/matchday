// Моковый «сервер»: принимает тот же метод и путь, что ушли бы в fetch,
// и отвечает теми же данными, что и настоящий API по контракту.
// Включается переменной VITE_USE_MOCKS=true (см. frontend/README.md).

import { ApiError } from '../client'
import { db, findMatch, findPlayer, findTeam, findTournament } from './db'
import {
  buildAssists,
  buildScorers,
  buildTable,
  toMatch,
  toPlayer,
  toTeam,
  toTeamListItem,
  toTournament,
  tournamentMatches,
} from './views'
import { addEvent, changeStatus, deleteEvent } from './writes'

// Код оператора, который принимают моки
export const MOCK_OPERATOR_TOKEN = 'dev-operator'

// Небольшая задержка, чтобы на экранах было видно состояние загрузки.
const MOCK_DELAY_MS = 300

type MockRequest = {
  method: string
  path: string
  body?: unknown
  operatorToken?: string | null
}

type Route = {
  method: string
  pattern: RegExp
  operatorOnly?: boolean
  // ids — числа из пути по порядку, например [4] для /api/matches/4
  handle: (ids: number[], request: MockRequest, url: URL) => unknown
}

const routes: Route[] = [
  { method: 'GET', pattern: /^\/api\/health$/, handle: () => ({ status: 'ok' }) },

  { method: 'GET', pattern: /^\/api\/tournaments$/, handle: () => db.tournaments.map(toTournament) },
  { method: 'GET', pattern: /^\/api\/tournaments\/(\d+)$/, handle: ([id]) => toTournament(findTournament(id)) },
  { method: 'GET', pattern: /^\/api\/tournaments\/(\d+)\/table$/, handle: ([id]) => buildTable(findTournament(id).id) },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/matches$/,
    handle: ([id]) => tournamentMatches(findTournament(id).id),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/scorers$/,
    handle: ([id]) => buildScorers(findTournament(id).id),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/assists$/,
    handle: ([id]) => buildAssists(findTournament(id).id),
  },

  { method: 'GET', pattern: /^\/api\/matches\/(\d+)$/, handle: ([id]) => toMatch(findMatch(id)) },

  {
    method: 'GET',
    pattern: /^\/api\/teams$/,
    handle: (_ids, _request, url) => {
      const tournamentId = Number(url.searchParams.get('tournament_id'))
      return db.teams.filter((t) => !tournamentId || t.tournament_id === tournamentId).map(toTeamListItem)
    },
  },
  { method: 'GET', pattern: /^\/api\/teams\/(\d+)$/, handle: ([id]) => toTeam(findTeam(id)) },
  { method: 'GET', pattern: /^\/api\/players\/(\d+)$/, handle: ([id]) => toPlayer(findPlayer(id)) },

  { method: 'GET', pattern: /^\/api\/operator\/check$/, operatorOnly: true, handle: () => undefined },
  {
    method: 'POST',
    pattern: /^\/api\/matches\/(\d+)\/events$/,
    operatorOnly: true,
    handle: ([id], request) => addEvent(id, request.body),
  },
  { method: 'DELETE', pattern: /^\/api\/events\/(\d+)$/, operatorOnly: true, handle: ([id]) => deleteEvent(id) },
  {
    method: 'PATCH',
    pattern: /^\/api\/matches\/(\d+)\/status$/,
    operatorOnly: true,
    handle: ([id], request) => changeStatus(id, request.body),
  },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function handleMockRequest(request: MockRequest): Promise<unknown> {
  await sleep(MOCK_DELAY_MS)
  const url = new URL(request.path, window.location.origin)

  for (const route of routes) {
    const found = route.method === request.method ? route.pattern.exec(url.pathname) : null
    if (!found) continue
    if (route.operatorOnly && request.operatorToken !== MOCK_OPERATOR_TOKEN) {
      throw new ApiError(401, 'Неверный код оператора')
    }
    const ids = found.slice(1).map(Number)
    // Копия, чтобы страница не получила ссылку на внутреннее состояние моков
    return structuredClone(route.handle(ids, request, url))
  }

  throw new ApiError(404, `В моках нет ответа на ${request.method} ${url.pathname}`)
}
