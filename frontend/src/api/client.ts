// Обёртки над fetch. Страницы и компоненты сюда не ходят напрямую —
// они берут данные через хуки из hooks.ts.

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

const OPERATOR_TOKEN_KEY = 'operatorToken'

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

// Ошибка ответа API. status = 0 — до сервера не достучались вовсе.
export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// localStorage оборачиваем в try/catch: в приватном режиме некоторых браузеров
// и при запрещённых cookie он бросает исключение, а падать из-за этого нельзя.
export function getOperatorToken(): string | null {
  try {
    return localStorage.getItem(OPERATOR_TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveOperatorToken(token: string): void {
  try {
    localStorage.setItem(OPERATOR_TOKEN_KEY, token)
  } catch {
    // Не сохранилось — оператору придётся ввести код ещё раз после перезагрузки.
  }
}

export function clearOperatorToken(): void {
  try {
    localStorage.removeItem(OPERATOR_TOKEN_KEY)
  } catch {
    // Нечего стирать.
  }
}

type RequestOptions = {
  body?: unknown
  operatorToken?: string | null
}

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, operatorToken } = options

  if (USE_MOCKS) {
    // Динамический импорт: без моков их код не попадает в основной бандл.
    const { handleMockRequest } = await import('./mocks/handler')
    return (await handleMockRequest({ method, path, body, operatorToken })) as T
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (operatorToken) headers['X-Operator-Token'] = operatorToken

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Нет связи с сервером')
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

// FastAPI кладёт текст ошибки в detail. У ошибок валидации (422) там
// не строка, а список объектов с полем msg.
async function readErrorDetail(response: Response): Promise<string> {
  const fallback = `Ошибка ${response.status}`
  try {
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null || !('detail' in data)) return fallback
    const { detail } = data
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const messages = detail.map((item) => (item as { msg?: unknown })?.msg).filter((msg) => typeof msg === 'string')
      if (messages.length > 0) return messages.join('; ')
    }
    return fallback
  } catch {
    return fallback
  }
}

// Чтение. Путь относительный: '/api/tournaments'.
export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

// Запись. Сам добавляет X-Operator-Token из localStorage.
export function apiSend<T>(method: Exclude<HttpMethod, 'GET'>, path: string, body?: unknown): Promise<T> {
  return request<T>(method, path, { body, operatorToken: getOperatorToken() })
}

// Проверка кода оператора до того, как он сохранён в localStorage.
export function checkOperatorToken(token: string): Promise<void> {
  return request<void>('GET', '/api/operator/check', { operatorToken: token })
}
