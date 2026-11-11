// Типы ответов API — общий контракт фронтенда и бэкенда (комментарий к задаче #36).
// Поменять поле можно только вместе с контрактом: напишите руководителю,
// и его обновят здесь, на бэкенде и в моках одновременно.

// ---------- Общие объекты ----------

export type TeamShort = { id: number; name: string; logo_url: string | null }

export type PlayerShort = {
  id: number
  full_name: string
  number: number | null
  position: string | null
}

export type Score = { home: number; away: number }

export type MatchStatus = 'scheduled' | 'live' | 'paused' | 'finished' | 'cancelled'

export type EventType = 'goal' | 'yellow_card' | 'red_card'

// Короткая ссылка на турнир внутри матча и команды
export type TournamentRef = { id: number; name: string }

// ---------- Турниры ----------

// GET /api/tournaments → Tournament[]
// GET /api/tournaments/{id} → Tournament
export type Tournament = {
  id: number
  name: string
  sport: string
  start_date: string // "2026-11-10"
  end_date: string
  status: 'upcoming' | 'ongoing' | 'finished' // бэкенд считает по датам
}

// GET /api/tournaments/{id}/table → TableRow[], уже отсортирована
export type TableRow = {
  position: number
  team: TeamShort
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

// GET /api/tournaments/{id}/matches → MatchShort[], по времени начала
export type MatchShort = {
  id: number
  starts_at: string // ISO-время с часовым поясом
  venue: string | null
  status: MatchStatus
  home_team: TeamShort
  away_team: TeamShort
  score: Score | null // null у запланированных и отменённых
}

// GET /api/tournaments/{id}/scorers → ScorerRow[], по убыванию голов
export type ScorerRow = { player: PlayerShort; team: TeamShort; goals: number }

// GET /api/tournaments/{id}/assists → AssistRow[], по убыванию передач
export type AssistRow = { player: PlayerShort; team: TeamShort; assists: number }

// ---------- Матч ----------

// GET /api/matches/{id} → Match
export type Match = MatchShort & {
  tournament: TournamentRef
  home_players: PlayerShort[]
  away_players: PlayerShort[]
  events: MatchEvent[] // по минуте, затем по времени создания
}

export type MatchEvent = {
  id: number
  minute: number
  type: EventType
  team_id: number // команда игрока, а не та, кому засчитан гол (важно для автоголов)
  player: PlayerShort
  assist: PlayerShort | null
  is_own_goal: boolean
}

// POST /api/matches/{id}/events, тело: NewEvent → 201, MatchEvent
// DELETE /api/events/{id} → 204
// PATCH /api/matches/{id}/status, тело: StatusChange → 200, Match
export type NewEvent = {
  type: EventType
  minute: number
  player_id: number
  assist_player_id?: number | null
  is_own_goal?: boolean
}

export type StatusChange = { status: MatchStatus }

// ---------- Команды и игроки ----------

// GET /api/teams?tournament_id=1 → TeamListItem[]
export type TeamListItem = TeamShort & { players_count: number }

export type TeamPlayer = PlayerShort & { photo_url: string | null }

// GET /api/teams/{id} → Team
export type Team = TeamShort & {
  tournament: TournamentRef
  players: TeamPlayer[]
}

export type PlayerStats = {
  goals: number
  assists: number
  yellow_cards: number
  red_cards: number
}

// GET /api/players/{id} → Player
export type Player = PlayerShort & {
  photo_url: string | null
  team: TeamShort
  stats?: PlayerStats // может прийти позже остальных полей — пока его нет, показываем прочерк
}

// ---------- Вход оператора ----------
// Все записывающие ручки ждут заголовок X-Operator-Token.
// GET /api/operator/check → 200 при верном коде, 401 при неверном или пустом.

// ---------- Ошибки ----------
// Любая ошибка приходит как { "detail": "Понятный текст" } — так их отдаёт FastAPI.
export type ApiErrorBody = { detail: string }
