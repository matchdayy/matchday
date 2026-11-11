import type { Role, User } from './types'

// Администратор может всё, что оператор, а оператор — всё, что зритель.
const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2 }

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Зритель',
  operator: 'Оператор',
  admin: 'Администратор',
}

export function hasRole(user: Pick<User, 'role'> | null | undefined, required: Role): boolean {
  return !!user && ROLE_RANK[user.role] >= ROLE_RANK[required]
}
