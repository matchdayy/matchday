// Обёртки над fetch. Страницы и компоненты сюда не ходят напрямую —
// они берут данные через хуки из hooks.ts.

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

const ACCESS_TOKEN_KEY = 'accessToken'

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

// ---------- Токен входа ----------

type TokenListener = (token: string | null) => void
const tokenListeners = new Set<TokenListener>()

// Подписка на вход и выход: queryClient.ts по ней сбрасывает данные прошлого пользователя.
export function onAccessTokenChange(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

function notifyTokenChange(token: string | null): void {
  tokenListeners.forEach((listener) => listener(token))
}

// localStorage оборачиваем в try/catch: в приватном режиме некоторых браузеров
// и при запрещённых cookie он бросает исключение, а падать из-за этого нельзя.
export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveAccessToken(token: string): void {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    // Не сохранилось — после перезагрузки страницы придётся войти ещё раз.
  }
  notifyTokenChange(token)
}

export function clearAccessToken(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    // Нечего стирать.
  }
  notifyTokenChange(null)
}

// Вход или выход в соседней вкладке — эта вкладка тоже должна его заметить.
window.addEventListener('storage', (event) => {
  if (event.key === ACCESS_TOKEN_KEY) notifyTokenChange(event.newValue)
})

// UUID для client_id события. crypto.randomUUID есть только на https и localhost,
// а телефон оператора в локальной сети открывает приложение по http — тогда собираем UUID сами.
export function newClientId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// ---------- Запросы ----------

type RequestOptions = {
  body?: unknown
  // false — не слать токен: вход и регистрация
  auth?: boolean
}

async function request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : getAccessToken()
  try {
    return await send<T>(method, path, options.body, token)
  } catch (error) {
    // Токен просрочен или аккаунт удалён — стираем, иначе каждый запрос будет падать с 401.
    if (token && error instanceof ApiError && error.status === 401) clearAccessToken()
    throw error
  }
}

async function send<T>(method: HttpMethod, path: string, body: unknown, token: string | null): Promise<T> {
  if (USE_MOCKS) {
    // Динамический импорт: без моков их код не попадает в основной бандл.
    const { handleMockRequest } = await import('./mocks/handler')
    return (await handleMockRequest({ method, path, body, token })) as T
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

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

// Чтение. Путь относительный: '/api/tournaments'. Токен, если он есть, уходит и сюда:
// некоторые открытые ручки отвечают вошедшему иначе, чем гостю (например, голоса матча).
export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

// Запись. Сам добавляет Authorization: Bearer из localStorage.
// { auth: false } — для входа и регистрации, где токена ещё нет.
export function apiSend<T>(
  method: Exclude<HttpMethod, 'GET'>,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = {},
): Promise<T> {
  return request<T>(method, path, { body, auth: options.auth })
}
