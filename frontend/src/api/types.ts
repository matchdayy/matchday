// Типы ответов API — общий контракт фронтенда и бэкенда: первая часть (комментарий
// к задаче #36) и вторая — пользователи, игровое время, фэнтези, голосование, администрирование.
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

// Игровое время. Считает бэкенд по журналу смен статуса, паузы не считаются.
// minute = elapsed_seconds // 60 + 1, не больше 150.
// Между опросами сервера часы можно вести на экране самим, пока running = true.
export type MatchClock = { elapsed_seconds: number; running: boolean; minute: number }

// Короткая ссылка на тур внутри матча
export type RoundRef = { id: number; number: number; title: string }

// GET /api/matches/{id} → Match
export type Match = MatchShort & {
  tournament: TournamentRef
  home_players: PlayerShort[]
  away_players: PlayerShort[]
  events: MatchEvent[] // по минуте, затем по времени создания
  clock: MatchClock | null // null у запланированных и отменённых
  round: RoundRef | null
}

export type MatchEvent = {
  id: number
  minute: number
  type: EventType
  team_id: number // команда игрока, а не та, кому засчитан гол (важно для автоголов)
  player: PlayerShort
  assist: PlayerShort | null
  is_own_goal: boolean
  client_id: string | null // UUID, который придумал телефон оператора; у старых событий null
}

// POST /api/matches/{id}/events, тело: NewEvent → 201, MatchEvent       (operator)
//      повторный POST с тем же client_id → 200 и уже созданное событие, второго не будет
// PATCH /api/events/{id}, тело: EventUpdate → 200, MatchEvent            (operator)
// DELETE /api/events/{id} → 204                                          (operator)
// PATCH /api/matches/{id}/status, тело: StatusChange → 200, Match         (operator)
export type NewEvent = {
  type: EventType
  minute?: number // не передали — сервер подставит clock.minute
  player_id: number
  assist_player_id?: number | null
  is_own_goal?: boolean
  client_id?: string | null // для офлайн-очереди: newClientId() из client.ts
}

export type EventUpdate = Partial<Omit<NewEvent, 'client_id'>>

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

// ---------- Пользователи и роли ----------
// Закрытые ручки ждут заголовок Authorization: Bearer <access_token>.
// Нет токена или он просрочен → 401, роль не та → 403.
// Администратор может всё, что оператор. Зарегистрироваться можно только зрителем,
// роль выдаёт администратор.

export type Role = 'viewer' | 'operator' | 'admin'

export type User = {
  id: number
  email: string
  display_name: string
  role: Role
  pd_consent_at: string // когда дано согласие на обработку персональных данных
}

// POST /api/auth/login, тело: LoginBody → 200, AuthResponse; неверная почта или пароль → 401
// POST /api/auth/register, тело: RegisterBody → 201, AuthResponse
//      pd_consent не true → 422, почта занята → 409
// GET /api/auth/me → 200, User; без токена или с просроченным → 401
// DELETE /api/auth/me → 204: отзыв согласия, аккаунт и всё, что к нему привязано, удаляется
export type AuthResponse = { access_token: string; user: User }

export type LoginBody = { email: string; password: string }

export type RegisterBody = {
  email: string
  password: string
  display_name: string
  pd_consent: boolean // сервер примет только true
}

// GET /api/users → User[]                               (admin)
// PATCH /api/users/{id}/role, тело: RoleChange → 200, User   (admin)
export type RoleChange = { role: Role }

// ---------- Туры ----------

// GET /api/tournaments/{id}/rounds → Round[]
// POST /api/tournaments/{id}/rounds, тело: RoundInput → 201, Round   (admin)
// PATCH /api/rounds/{id}, тело: часть RoundInput → 200, Round       (admin)
// DELETE /api/rounds/{id} → 204                                       (admin)
// POST /api/rounds/{id}/close → 200, Round                             (admin)
//      не все матчи тура завершены или отменены → 409
//      тур уже закрыт → 200 и тот же Round, очки не пересчитываются
export type Round = {
  id: number
  tournament_id: number
  number: number
  title: string // «Тур 1»
  deadline: string // ISO-время: до него можно менять фэнтези-составы
  closed_at: string | null // тур закрыт администратором, очки зафиксированы
}

export type RoundInput = { number: number; title: string; deadline: string }

// ---------- Фэнтези ----------
// Очки начисляются только при закрытии тура и после этого не меняются.

// GET /api/fantasy/rules → FantasyRules
export type FantasyRules = {
  squad_size: number // 5
  budget: number // 50 — сумма стоимостей игроков в составе
  max_per_team: number // 2 — не больше двух игроков из одной команды
  points: Record<PointsReason, number> // { goal: 4, assist: 3, played: 1, yellow_card: -1, ... }
}

// GET /api/tournaments/{id}/fantasy/players → FantasyPlayer[]
export type FantasyPlayer = PlayerShort & { team: TeamShort; price: number }

// GET /api/tournaments/{id}/fantasy/my-team → FantasyTeam; ещё не создана → 404
// POST /api/tournaments/{id}/fantasy/my-team, тело: { name } → 201, FantasyTeam
export type FantasyTeam = {
  id: number
  name: string
  tournament_id: number
  owner: { id: number; display_name: string }
}

// GET /api/rounds/{id}/fantasy/my-lineup → Lineup; состава нет → 404
// PUT /api/rounds/{id}/fantasy/my-lineup, тело: LineupInput → 200, Lineup
//      дедлайн прошёл → 409; не то число игроков, бюджет превышен,
//      больше max_per_team из одной команды, игрок не из турнира → 422 с понятным текстом
export type Lineup = { round_id: number; players: FantasyPlayer[]; total_price: number; locked: boolean }

export type LineupInput = { player_ids: number[] }

// GET /api/tournaments/{id}/fantasy/rating → RatingRow[]
// GET /api/fantasy/leagues/{id}/rating → RatingRow[]
export type RatingRow = { position: number; fantasy_team: FantasyTeam; points: number; last_round_points: number }

// GET /api/tournaments/{id}/fantasy/my-leagues → FantasyLeague[]
// POST /api/tournaments/{id}/fantasy/leagues, тело: { name } → 201, FantasyLeague
// POST /api/fantasy/leagues/join, тело: { invite_code } → 200, FantasyLeague; кода нет → 404
export type FantasyLeague = {
  id: number
  name: string
  tournament_id: number
  invite_code: string | null // виден только участникам лиги
  members_count: number
}

export type PointsReason = 'goal' | 'assist' | 'played' | 'yellow_card' | 'red_card' | 'own_goal'

// GET /api/fantasy/teams/{id}/points?round_id=1 → PointsEntry[] — журнал начислений
export type PointsEntry = {
  id: number
  round_id: number
  player: PlayerShort
  points: number
  reason: PointsReason
  match_id: number
  event_id: number | null // null у очков за участие в матче
  minute: number | null
}

// ---------- Голосование за лучшего игрока матча ----------
// Голосовать может любой вошедший пользователь: один голос на матч, только за игрока
// одной из двух команд, в течение 24 часов после завершения матча.

// GET /api/matches/{id}/votes → VoteResults
// POST /api/matches/{id}/votes, тело: VoteInput → 201, VoteResults
//      уже голосовал → 409; матч не завершён или голосование закрыто → 409; игрок не из матча → 422
export type VoteResults = {
  match_id: number
  is_open: boolean
  closes_at: string | null
  my_vote_player_id: number | null // null, если не голосовал или не вошёл
  results: { player: PlayerShort; team_id: number; votes: number }[] // по убыванию голосов
  winner: PlayerShort | null // только после закрытия; при равенстве — null
}

export type VoteInput = { player_id: number }

// ---------- Администрирование (только admin) ----------

// POST /api/tournaments, тело: TournamentInput → 201, Tournament
// PATCH /api/tournaments/{id}, тело: часть TournamentInput → 200, Tournament
// DELETE /api/tournaments/{id} → 204
export type TournamentInput = { name: string; sport: string; start_date: string; end_date: string }

// POST /api/tournaments/{id}/matches, тело: MatchInput → 201, Match
// PATCH /api/matches/{id}, тело: часть MatchInput → 200, Match
// DELETE /api/matches/{id} → 204; у матча уже есть события → 409, сначала отменить
export type MatchInput = {
  home_team_id: number
  away_team_id: number
  starts_at: string
  venue: string | null
  round_id: number | null
}

// PATCH /api/teams/{id}, тело: TeamUpdate → 200, Team
// DELETE /api/teams/{id} → 204; у команды есть матчи → 409
export type TeamUpdate = { name?: string; logo_url?: string | null }

// PATCH /api/players/{id}, тело: PlayerUpdate → 200, Player
// DELETE /api/players/{id} → 204; у игрока есть события → 409
export type PlayerUpdate = {
  full_name?: string
  number?: number | null
  position?: string | null
  photo_url?: string | null
  price?: number
}

// ---------- Ошибки ----------
// Любая ошибка приходит как { "detail": "Понятный текст" } — так их отдаёт FastAPI.
export type ApiErrorBody = { detail: string }
