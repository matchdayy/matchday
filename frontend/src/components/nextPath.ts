// Куда вернуть пользователя после входа: RequireRole кладёт адрес в ?next=.
// Принимаем только адреса внутри приложения — иначе ссылкой вида /login?next=https://...
// можно увести человека на чужой сайт сразу после ввода пароля.
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
