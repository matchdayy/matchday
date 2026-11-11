// Моковый «сервер»: принимает тот же метод и путь, что ушли бы в fetch,
// и отвечает теми же данными, что и настоящий API по контракту.
// Включается переменной VITE_USE_MOCKS=true (см. frontend/README.md).

import { ApiError } from '../client'
import type { Role } from '../types'
import * as admin from './admin'
import { changeRole, deleteAccount, login, register, requireUser, toUser, userFromToken } from './auth'
import { db, findMatch, findPlayer, findTeam, findTournament, type UserRow } from './db'
import * as fantasy from './fantasy'
import * as rounds from './rounds'
import { seedDemoData } from './seed'
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
import { voteResults, vote } from './votes'
import { addEvent, changeStatus, deleteEvent, updateEvent } from './writes'

seedDemoData()

// Небольшая задержка, чтобы на экранах было видно состояние загрузки.
const MOCK_DELAY_MS = 300

type MockRequest = {
  method: string
  path: string
  body?: unknown
  token?: string | null
}

type Context = {
  // ids — числа из пути по порядку, например [4] для /api/matches/4
  ids: number[]
  body: unknown
  url: URL
  // Вошедший пользователь. На закрытых ручках (access задан) он точно есть.
  user: UserRow | null
}

type Route = {
  method: string
  pattern: RegExp
  // Кому можно: не задано — всем, в том числе гостям; 'viewer' — любому вошедшему.
  access?: Role
  handle: (context: Context) => unknown
}

// На закрытой ручке пользователь уже проверен — достаём его без лишних «!».
const me = (context: Context) => context.user as UserRow

const routes: Route[] = [
  { method: 'GET', pattern: /^\/api\/health$/, handle: () => ({ status: 'ok' }) },

  // ---------- Пользователи ----------
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handle: ({ body }) => login(body) },
  { method: 'POST', pattern: /^\/api\/auth\/register$/, handle: ({ body }) => register(body) },
  { method: 'GET', pattern: /^\/api\/auth\/me$/, access: 'viewer', handle: (c) => toUser(me(c)) },
  { method: 'DELETE', pattern: /^\/api\/auth\/me$/, access: 'viewer', handle: (c) => deleteAccount(me(c)) },
  { method: 'GET', pattern: /^\/api\/users$/, access: 'admin', handle: () => db.users.map(toUser) },
  {
    method: 'PATCH',
    pattern: /^\/api\/users\/(\d+)\/role$/,
    access: 'admin',
    handle: (c) => changeRole(me(c), c.ids[0], c.body),
  },

  // ---------- Турниры ----------
  { method: 'GET', pattern: /^\/api\/tournaments$/, handle: () => db.tournaments.map(toTournament) },
  { method: 'POST', pattern: /^\/api\/tournaments$/, access: 'admin', handle: ({ body }) => admin.createTournament(body) },
  { method: 'GET', pattern: /^\/api\/tournaments\/(\d+)$/, handle: ({ ids }) => toTournament(findTournament(ids[0])) },
  {
    method: 'PATCH',
    pattern: /^\/api\/tournaments\/(\d+)$/,
    access: 'admin',
    handle: ({ ids, body }) => admin.updateTournament(ids[0], body),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/tournaments\/(\d+)$/,
    access: 'admin',
    handle: ({ ids }) => admin.deleteTournament(ids[0]),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/table$/,
    handle: ({ ids }) => buildTable(findTournament(ids[0]).id),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/matches$/,
    handle: ({ ids }) => tournamentMatches(findTournament(ids[0]).id),
  },
  {
    method: 'POST',
    pattern: /^\/api\/tournaments\/(\d+)\/matches$/,
    access: 'admin',
    handle: ({ ids, body }) => admin.createMatch(ids[0], body),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/scorers$/,
    handle: ({ ids }) => buildScorers(findTournament(ids[0]).id),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/assists$/,
    handle: ({ ids }) => buildAssists(findTournament(ids[0]).id),
  },

  // ---------- Туры ----------
  { method: 'GET', pattern: /^\/api\/tournaments\/(\d+)\/rounds$/, handle: ({ ids }) => rounds.tournamentRounds(ids[0]) },
  {
    method: 'POST',
    pattern: /^\/api\/tournaments\/(\d+)\/rounds$/,
    access: 'admin',
    handle: ({ ids, body }) => rounds.createRound(ids[0], body),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/rounds\/(\d+)$/,
    access: 'admin',
    handle: ({ ids, body }) => rounds.updateRound(ids[0], body),
  },
  { method: 'DELETE', pattern: /^\/api\/rounds\/(\d+)$/, access: 'admin', handle: ({ ids }) => rounds.deleteRound(ids[0]) },
  { method: 'POST', pattern: /^\/api\/rounds\/(\d+)\/close$/, access: 'admin', handle: ({ ids }) => rounds.closeRound(ids[0]) },

  // ---------- Матчи и события ----------
  { method: 'GET', pattern: /^\/api\/matches\/(\d+)$/, handle: ({ ids }) => toMatch(findMatch(ids[0])) },
  {
    method: 'PATCH',
    pattern: /^\/api\/matches\/(\d+)$/,
    access: 'admin',
    handle: ({ ids, body }) => admin.updateMatch(ids[0], body),
  },
  { method: 'DELETE', pattern: /^\/api\/matches\/(\d+)$/, access: 'admin', handle: ({ ids }) => admin.deleteMatch(ids[0]) },
  {
    method: 'POST',
    pattern: /^\/api\/matches\/(\d+)\/events$/,
    access: 'operator',
    handle: ({ ids, body }) => addEvent(ids[0], body),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/events\/(\d+)$/,
    access: 'operator',
    handle: ({ ids, body }) => updateEvent(ids[0], body),
  },
  { method: 'DELETE', pattern: /^\/api\/events\/(\d+)$/, access: 'operator', handle: ({ ids }) => deleteEvent(ids[0]) },
  {
    method: 'PATCH',
    pattern: /^\/api\/matches\/(\d+)\/status$/,
    access: 'operator',
    handle: ({ ids, body }) => changeStatus(ids[0], body),
  },
  { method: 'GET', pattern: /^\/api\/matches\/(\d+)\/votes$/, handle: ({ ids, user }) => voteResults(ids[0], user) },
  {
    method: 'POST',
    pattern: /^\/api\/matches\/(\d+)\/votes$/,
    access: 'viewer',
    handle: (c) => vote(me(c), c.ids[0], c.body),
  },

  // ---------- Команды и игроки ----------
  {
    method: 'GET',
    pattern: /^\/api\/teams$/,
    handle: ({ url }) => {
      const tournamentId = Number(url.searchParams.get('tournament_id'))
      return db.teams.filter((t) => !tournamentId || t.tournament_id === tournamentId).map(toTeamListItem)
    },
  },
  { method: 'GET', pattern: /^\/api\/teams\/(\d+)$/, handle: ({ ids }) => toTeam(findTeam(ids[0])) },
  { method: 'PATCH', pattern: /^\/api\/teams\/(\d+)$/, access: 'admin', handle: ({ ids, body }) => admin.updateTeam(ids[0], body) },
  { method: 'DELETE', pattern: /^\/api\/teams\/(\d+)$/, access: 'admin', handle: ({ ids }) => admin.deleteTeam(ids[0]) },
  { method: 'GET', pattern: /^\/api\/players\/(\d+)$/, handle: ({ ids }) => toPlayer(findPlayer(ids[0])) },
  {
    method: 'PATCH',
    pattern: /^\/api\/players\/(\d+)$/,
    access: 'admin',
    handle: ({ ids, body }) => admin.updatePlayer(ids[0], body),
  },
  { method: 'DELETE', pattern: /^\/api\/players\/(\d+)$/, access: 'admin', handle: ({ ids }) => admin.deletePlayer(ids[0]) },

  // ---------- Фэнтези ----------
  { method: 'GET', pattern: /^\/api\/fantasy\/rules$/, handle: () => fantasy.FANTASY_RULES },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/players$/,
    handle: ({ ids }) => fantasy.fantasyPlayers(ids[0]),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/my-team$/,
    access: 'viewer',
    handle: (c) => fantasy.myFantasyTeam(me(c), c.ids[0]),
  },
  {
    method: 'POST',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/my-team$/,
    access: 'viewer',
    handle: (c) => fantasy.createFantasyTeam(me(c), c.ids[0], c.body),
  },
  {
    method: 'GET',
    pattern: /^\/api\/rounds\/(\d+)\/fantasy\/my-lineup$/,
    access: 'viewer',
    handle: (c) => fantasy.myLineup(me(c), c.ids[0]),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/rounds\/(\d+)\/fantasy\/my-lineup$/,
    access: 'viewer',
    handle: (c) => fantasy.saveMyLineup(me(c), c.ids[0], c.body),
  },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/rating$/,
    handle: ({ ids }) => fantasy.tournamentRating(ids[0]),
  },
  { method: 'GET', pattern: /^\/api\/fantasy\/leagues\/(\d+)\/rating$/, handle: ({ ids }) => fantasy.leagueRating(ids[0]) },
  {
    method: 'GET',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/my-leagues$/,
    access: 'viewer',
    handle: (c) => fantasy.myLeagues(me(c), c.ids[0]),
  },
  {
    method: 'POST',
    pattern: /^\/api\/tournaments\/(\d+)\/fantasy\/leagues$/,
    access: 'viewer',
    handle: (c) => fantasy.createLeague(me(c), c.ids[0], c.body),
  },
  {
    method: 'POST',
    pattern: /^\/api\/fantasy\/leagues\/join$/,
    access: 'viewer',
    handle: (c) => fantasy.joinLeague(me(c), c.body),
  },
  {
    method: 'GET',
    pattern: /^\/api\/fantasy\/teams\/(\d+)\/points$/,
    handle: ({ ids, url }) => fantasy.teamPoints(ids[0], url.searchParams.get('round_id')),
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
    const user = userFromToken(request.token)
    if (route.access) {
      if (request.token && !user) throw new ApiError(401, 'Сессия устарела, войдите снова')
      requireUser(user, route.access)
    }
    const ids = found.slice(1).map(Number)
    // Копия, чтобы страница не получила ссылку на внутреннее состояние моков
    const result = route.handle({ ids, body: request.body, url, user })
    return result === undefined ? undefined : structuredClone(result)
  }

  throw new ApiError(404, `В моках нет ответа на ${request.method} ${url.pathname}`)
}
