// Пользователи и вход в моках.
// Токен — просто «mock-token-<id пользователя>». Так вход переживает перезагрузку страницы:
// демо-пользователи после неё на месте, а зарегистрированные пропадают — и их токен
// получает 401, как просроченный на настоящем бэкенде.

import { ApiError } from '../client'
import { hasRole } from '../roles'
import type { AuthResponse, LoginBody, RegisterBody, Role, User } from '../types'
import { conflict, db, findUser, invalid, nextId, type UserRow } from './db'

const TOKEN_PREFIX = 'mock-token-'
const ROLES: Role[] = ['viewer', 'operator', 'admin']

export function toUser(user: UserRow): User {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    pd_consent_at: user.pd_consent_at,
  }
}

function authResponse(user: UserRow): AuthResponse {
  return { access_token: `${TOKEN_PREFIX}${user.id}`, user: toUser(user) }
}

// null — гость или токен недействителен.
export function userFromToken(token: string | null | undefined): UserRow | null {
  if (!token?.startsWith(TOKEN_PREFIX)) return null
  const id = Number(token.slice(TOKEN_PREFIX.length))
  return db.users.find((u) => u.id === id) ?? null
}

// Проверка доступа к закрытой ручке: нет входа → 401, роль ниже нужной → 403.
export function requireUser(user: UserRow | null, role: Role): UserRow {
  if (!user) throw new ApiError(401, 'Нужно войти')
  if (!hasRole(user, role)) throw new ApiError(403, 'Недостаточно прав')
  return user
}

function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function login(body: unknown): AuthResponse {
  const input = (body ?? {}) as Partial<LoginBody>
  const email = normalizeEmail(input.email)
  const user = db.users.find((u) => u.email === email && u.password === input.password)
  if (!user) throw new ApiError(401, 'Неверная почта или пароль')
  return authResponse(user)
}

export function register(body: unknown): AuthResponse {
  const input = (body ?? {}) as Partial<RegisterBody>
  if (input.pd_consent !== true) invalid('Нужно согласие на обработку персональных данных')
  const email = normalizeEmail(input.email)
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) invalid('Укажите почту')
  if (typeof input.password !== 'string' || input.password.length < 4) invalid('Пароль — не короче 4 символов')
  const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : ''
  if (!displayName) invalid('Укажите имя')
  if (db.users.some((u) => u.email === email)) conflict('Эта почта уже зарегистрирована')

  const user: UserRow = {
    id: nextId(db.users),
    email,
    password: input.password,
    display_name: displayName,
    role: 'viewer',
    pd_consent_at: new Date().toISOString(),
  }
  db.users.push(user)
  return authResponse(user)
}

// Отзыв согласия: удаляем пользователя и всё, что к нему привязано.
export function deleteAccount(user: UserRow): void {
  const teamIds = new Set(db.fantasyTeams.filter((t) => t.owner_id === user.id).map((t) => t.id))
  db.fantasyTeams = db.fantasyTeams.filter((t) => !teamIds.has(t.id))
  db.lineups = db.lineups.filter((l) => !teamIds.has(l.fantasy_team_id))
  db.pointsEntries = db.pointsEntries.filter((p) => !teamIds.has(p.fantasy_team_id))
  db.leagues.forEach((league) => {
    league.member_team_ids = league.member_team_ids.filter((id) => !teamIds.has(id))
  })
  db.votes = db.votes.filter((v) => v.user_id !== user.id)
  db.users = db.users.filter((u) => u.id !== user.id)
}

export function changeRole(admin: UserRow, userId: number, body: unknown): User {
  const target = findUser(userId)
  const role = (body as { role?: Role } | undefined)?.role
  if (!role || !ROLES.includes(role)) invalid('Неизвестная роль')
  // Иначе единственный администратор может случайно лишить себя доступа к админке.
  if (target.id === admin.id) conflict('Свою роль поменять нельзя — попросите другого администратора')
  target.role = role
  return toUser(target)
}
