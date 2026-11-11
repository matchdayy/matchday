// Хуки данных. Одинаково работают с моками и с настоящим API.
// Счёт, таблицу, статистику, игровое время и фэнтези-очки считает бэкенд —
// здесь и на страницах их не пересчитываем.

import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { ApiError, apiGet, apiSend, clearAccessToken, getAccessToken, saveAccessToken } from './client'
import type {
  AssistRow,
  AuthResponse,
  EventUpdate,
  FantasyLeague,
  FantasyPlayer,
  FantasyRules,
  FantasyTeam,
  Lineup,
  LineupInput,
  LoginBody,
  Match,
  MatchEvent,
  MatchInput,
  MatchShort,
  MatchStatus,
  NewEvent,
  Player,
  PlayerUpdate,
  PointsEntry,
  RatingRow,
  RegisterBody,
  Role,
  RoleChange,
  Round,
  RoundInput,
  ScorerRow,
  StatusChange,
  TableRow,
  Team,
  TeamListItem,
  TeamUpdate,
  Tournament,
  TournamentInput,
  User,
  VoteInput,
  VoteResults,
} from './types'

// По ТЗ событие, внесённое оператором, должно появиться у зрителя не позже чем
// через 5 секунд. Опрос раз в 3 секунды оставляет запас на сам запрос.
export const MATCH_POLL_INTERVAL_MS = 3000

// Ключи кэша. Мутации по ним понимают, какие данные устарели.
// Всё, что зависит от вошедшего пользователя, лежит под ключом 'my' —
// при входе и выходе это сбрасывается целиком (см. resetUserData).
export const queryKeys = {
  health: ['health'] as const,
  me: ['auth', 'me'] as const,
  users: ['users'] as const,
  tournaments: ['tournaments'] as const,
  tournament: (id: number) => ['tournaments', id] as const,
  tournamentTable: (id: number) => ['tournaments', id, 'table'] as const,
  tournamentMatches: (id: number) => ['tournaments', id, 'matches'] as const,
  tournamentScorers: (id: number) => ['tournaments', id, 'scorers'] as const,
  tournamentAssists: (id: number) => ['tournaments', id, 'assists'] as const,
  tournamentTeams: (id: number) => ['tournaments', id, 'teams'] as const,
  rounds: (tournamentId: number) => ['tournaments', tournamentId, 'rounds'] as const,
  fantasy: (tournamentId: number) => ['tournaments', tournamentId, 'fantasy'] as const,
  fantasyPlayers: (tournamentId: number) => ['tournaments', tournamentId, 'fantasy', 'players'] as const,
  fantasyRating: (tournamentId: number) => ['tournaments', tournamentId, 'fantasy', 'rating'] as const,
  fantasyRules: ['fantasy', 'rules'] as const,
  leagueRating: (leagueId: number) => ['fantasy', 'leagues', leagueId, 'rating'] as const,
  fantasyPoints: (teamId: number, roundId?: number) => ['fantasy', 'teams', teamId, 'points', roundId ?? 'all'] as const,
  my: ['my'] as const,
  myFantasyTeam: (tournamentId: number) => ['my', 'fantasy-team', tournamentId] as const,
  myLineups: ['my', 'lineup'] as const,
  myLineup: (roundId: number) => ['my', 'lineup', roundId] as const,
  myLeagues: (tournamentId: number) => ['my', 'leagues', tournamentId] as const,
  matches: ['matches'] as const,
  match: (id: number) => ['matches', id] as const,
  matchVotes: (id: number) => ['matches', id, 'votes'] as const,
  teams: ['teams'] as const,
  team: (id: number) => ['teams', id] as const,
  players: ['players'] as const,
  player: (id: number) => ['players', id] as const,
}

// 404 у «моих» ручек значит «ещё не создано» — отдаём null, чтобы на странице
// было удобно написать if (!team.data) вместо разбора ошибки.
async function nullIfStatus<T>(status: number, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (error instanceof ApiError && error.status === status) return null
    throw error
  }
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return (...keys: QueryKey[]) => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

// ---------- Пользователь ----------

// Вызывается из queryClient.ts при каждом входе и выходе, в том числе в соседней вкладке
// и когда сервер ответил 401 на просроченный токен.
export function resetUserData(queryClient: QueryClient, token: string | null): void {
  if (token === null) queryClient.setQueryData(queryKeys.me, null)
  else void queryClient.invalidateQueries({ queryKey: queryKeys.me })
  void queryClient.resetQueries({ queryKey: queryKeys.my })
  void queryClient.resetQueries({ queryKey: queryKeys.users })
  // В голосах есть my_vote_player_id — он свой у каждого пользователя.
  void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === 'votes' })
}

// data: User — вошёл, null — не вошёл. Ошибкой считается только сбой сети или сервера.
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => (getAccessToken() ? nullIfStatus(401, apiGet<User>('/api/auth/me')) : null),
    staleTime: 5 * 60 * 1000,
  })
}

function useSaveSession() {
  const queryClient = useQueryClient()
  return (response: AuthResponse) => {
    saveAccessToken(response.access_token)
    queryClient.setQueryData(queryKeys.me, response.user)
  }
}

// mutate({ email, password }) → POST /api/auth/login. Неверная пара → error.status === 401.
export function useLogin() {
  const saveSession = useSaveSession()
  return useMutation({
    mutationFn: (body: LoginBody) => apiSend<AuthResponse>('POST', '/api/auth/login', body, { auth: false }),
    onSuccess: saveSession,
  })
}

// mutate({ email, password, display_name, pd_consent }) → POST /api/auth/register.
// Без pd_consent: true → 422, почта занята → 409.
export function useRegister() {
  const saveSession = useSaveSession()
  return useMutation({
    mutationFn: (body: RegisterBody) => apiSend<AuthResponse>('POST', '/api/auth/register', body, { auth: false }),
    onSuccess: saveSession,
  })
}

// const logout = useLogout(); logout() — выход на этом устройстве. Ручки на сервере для этого нет:
// токен просто стирается.
export function useLogout() {
  return () => clearAccessToken()
}

// mutate() → DELETE /api/auth/me: отзыв согласия, аккаунт удаляется вместе с фэнтези-командами,
// лигами и голосами. Перед вызовом обязательно спросите пользователя.
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiSend<void>('DELETE', '/api/auth/me'),
    onSuccess: () => {
      clearAccessToken()
      // Пропали его фэнтези-команда и голоса — меняются рейтинги и итоги голосований.
      // Не ждём перезагрузки: страница должна сразу увести пользователя из личного кабинета.
      void queryClient.invalidateQueries()
    },
  })
}

// Список пользователей (admin)
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => apiGet<User[]>('/api/users'),
  })
}

// mutate({ userId, role }) → PATCH /api/users/{userId}/role (admin)
export function useChangeRole() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: Role }) =>
      apiSend<User>('PATCH', `/api/users/${userId}/role`, { role } satisfies RoleChange),
    onSuccess: () => invalidate(queryKeys.users, queryKeys.me),
  })
}

// ---------- Турниры: чтение ----------

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => apiGet<{ status: string }>('/api/health'),
  })
}

export function useTournaments() {
  return useQuery({
    queryKey: queryKeys.tournaments,
    queryFn: () => apiGet<Tournament[]>('/api/tournaments'),
  })
}

export function useTournament(id: number) {
  return useQuery({
    queryKey: queryKeys.tournament(id),
    queryFn: () => apiGet<Tournament>(`/api/tournaments/${id}`),
  })
}

export function useTournamentTable(id: number) {
  return useQuery({
    queryKey: queryKeys.tournamentTable(id),
    queryFn: () => apiGet<TableRow[]>(`/api/tournaments/${id}/table`),
  })
}

export function useTournamentMatches(id: number) {
  return useQuery({
    queryKey: queryKeys.tournamentMatches(id),
    queryFn: () => apiGet<MatchShort[]>(`/api/tournaments/${id}/matches`),
  })
}

export function useTournamentScorers(id: number) {
  return useQuery({
    queryKey: queryKeys.tournamentScorers(id),
    queryFn: () => apiGet<ScorerRow[]>(`/api/tournaments/${id}/scorers`),
  })
}

export function useTournamentAssists(id: number) {
  return useQuery({
    queryKey: queryKeys.tournamentAssists(id),
    queryFn: () => apiGet<AssistRow[]>(`/api/tournaments/${id}/assists`),
  })
}

// Команды турнира: GET /api/teams?tournament_id={id}
export function useTournamentTeams(id: number) {
  return useQuery({
    queryKey: queryKeys.tournamentTeams(id),
    queryFn: () => apiGet<TeamListItem[]>(`/api/teams?tournament_id=${id}`),
  })
}

export function useRounds(tournamentId: number) {
  return useQuery({
    queryKey: queryKeys.rounds(tournamentId),
    queryFn: () => apiGet<Round[]>(`/api/tournaments/${tournamentId}/rounds`),
  })
}

function isInProgress(status: MatchStatus | undefined): boolean {
  return status === 'live' || status === 'paused'
}

// Пока матч идёт или на перерыве, данные обновляются сами.
export function useMatch(id: number) {
  return useQuery({
    queryKey: queryKeys.match(id),
    queryFn: () => apiGet<Match>(`/api/matches/${id}`),
    refetchInterval: (query) => (isInProgress(query.state.data?.status) ? MATCH_POLL_INTERVAL_MS : false),
    refetchOnWindowFocus: true,
  })
}

export function useTeam(id: number) {
  return useQuery({
    queryKey: queryKeys.team(id),
    queryFn: () => apiGet<Team>(`/api/teams/${id}`),
  })
}

export function usePlayer(id: number) {
  return useQuery({
    queryKey: queryKeys.player(id),
    queryFn: () => apiGet<Player>(`/api/players/${id}`),
  })
}

// ---------- Запись: экран оператора (operator) ----------

const MATCH_DEPENDENT_LISTS = new Set<unknown>(['table', 'matches', 'scorers', 'assists'])

// После записи устаревают матч (вместе с голосами), а с ним таблица, список матчей,
// бомбардиры и статистика игроков. Фэнтези-очки не меняются: они фиксируются при закрытии тура.
function useInvalidateAfterMatchChange(matchId: number) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.match(matchId) }),
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === 'tournaments' && MATCH_DEPENDENT_LISTS.has(query.queryKey[2]),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.players }),
    ])
}

// mutate(newEvent) → POST /api/matches/{matchId}/events
// Для офлайн-очереди передавайте client_id: newClientId() из client.ts. Повтор с тем же
// client_id не создаст второе событие — сервер вернёт уже созданное.
export function useAddEvent(matchId: number) {
  const invalidate = useInvalidateAfterMatchChange(matchId)
  return useMutation({
    mutationFn: (event: NewEvent) => apiSend<MatchEvent>('POST', `/api/matches/${matchId}/events`, event),
    onSuccess: invalidate,
  })
}

// mutate({ id, ...поля }) → PATCH /api/events/{id}
export function useUpdateEvent(matchId: number) {
  const invalidate = useInvalidateAfterMatchChange(matchId)
  return useMutation({
    mutationFn: ({ id, ...fields }: EventUpdate & { id: number }) =>
      apiSend<MatchEvent>('PATCH', `/api/events/${id}`, fields),
    onSuccess: invalidate,
  })
}

// mutate(eventId) → DELETE /api/events/{eventId}
export function useDeleteEvent(matchId: number) {
  const invalidate = useInvalidateAfterMatchChange(matchId)
  return useMutation({
    mutationFn: (eventId: number) => apiSend<void>('DELETE', `/api/events/${eventId}`),
    onSuccess: invalidate,
  })
}

// mutate('live') → PATCH /api/matches/{matchId}/status
export function useChangeStatus(matchId: number) {
  const invalidate = useInvalidateAfterMatchChange(matchId)
  return useMutation({
    mutationFn: (status: MatchStatus) =>
      apiSend<Match>('PATCH', `/api/matches/${matchId}/status`, { status } satisfies StatusChange),
    onSuccess: invalidate,
  })
}

// ---------- Голосование за лучшего игрока матча ----------

export function useMatchVotes(matchId: number) {
  return useQuery({
    queryKey: queryKeys.matchVotes(matchId),
    queryFn: () => apiGet<VoteResults>(`/api/matches/${matchId}/votes`),
  })
}

// mutate(playerId) → POST /api/matches/{matchId}/votes. Нужен вход.
export function useVote(matchId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerId: number) =>
      apiSend<VoteResults>('POST', `/api/matches/${matchId}/votes`, { player_id: playerId } satisfies VoteInput),
    onSuccess: (results) => queryClient.setQueryData(queryKeys.matchVotes(matchId), results),
  })
}

// ---------- Фэнтези ----------

export function useFantasyRules() {
  return useQuery({
    queryKey: queryKeys.fantasyRules,
    queryFn: () => apiGet<FantasyRules>('/api/fantasy/rules'),
    staleTime: Infinity,
  })
}

// Игроки турнира с ценами
export function useFantasyPlayers(tournamentId: number) {
  return useQuery({
    queryKey: queryKeys.fantasyPlayers(tournamentId),
    queryFn: () => apiGet<FantasyPlayer[]>(`/api/tournaments/${tournamentId}/fantasy/players`),
  })
}

// data: FantasyTeam — команда есть, null — ещё не создана. Нужен вход.
export function useMyFantasyTeam(tournamentId: number) {
  return useQuery({
    queryKey: queryKeys.myFantasyTeam(tournamentId),
    queryFn: () => nullIfStatus(404, apiGet<FantasyTeam>(`/api/tournaments/${tournamentId}/fantasy/my-team`)),
  })
}

// mutate(name) → POST /api/tournaments/{tournamentId}/fantasy/my-team
export function useCreateFantasyTeam(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      apiSend<FantasyTeam>('POST', `/api/tournaments/${tournamentId}/fantasy/my-team`, { name }),
    onSuccess: (team) => {
      queryClient.setQueryData(queryKeys.myFantasyTeam(tournamentId), team)
      return queryClient.invalidateQueries({ queryKey: queryKeys.fantasyRating(tournamentId) })
    },
  })
}

// data: Lineup — состав на тур есть, null — ещё не присылали. Нужен вход.
export function useMyLineup(roundId: number) {
  return useQuery({
    queryKey: queryKeys.myLineup(roundId),
    queryFn: () => nullIfStatus(404, apiGet<Lineup>(`/api/rounds/${roundId}/fantasy/my-lineup`)),
  })
}

// mutate([1, 9, 12, 25, 33]) → PUT /api/rounds/{roundId}/fantasy/my-lineup
// Дедлайн прошёл → 409; размер, бюджет, лимит игроков из одной команды → 422 с текстом в error.detail.
export function useSaveLineup(roundId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (playerIds: number[]) =>
      apiSend<Lineup>('PUT', `/api/rounds/${roundId}/fantasy/my-lineup`, {
        player_ids: playerIds,
      } satisfies LineupInput),
    onSuccess: (lineup) => queryClient.setQueryData(queryKeys.myLineup(roundId), lineup),
  })
}

export function useFantasyRating(tournamentId: number) {
  return useQuery({
    queryKey: queryKeys.fantasyRating(tournamentId),
    queryFn: () => apiGet<RatingRow[]>(`/api/tournaments/${tournamentId}/fantasy/rating`),
  })
}

export function useLeagueRating(leagueId: number) {
  return useQuery({
    queryKey: queryKeys.leagueRating(leagueId),
    queryFn: () => apiGet<RatingRow[]>(`/api/fantasy/leagues/${leagueId}/rating`),
  })
}

// Лиги, в которых состоит моя фэнтези-команда. Нужен вход.
export function useMyLeagues(tournamentId: number) {
  return useQuery({
    queryKey: queryKeys.myLeagues(tournamentId),
    queryFn: () => apiGet<FantasyLeague[]>(`/api/tournaments/${tournamentId}/fantasy/my-leagues`),
  })
}

// mutate(name) → POST /api/tournaments/{tournamentId}/fantasy/leagues. В ответе — код приглашения.
export function useCreateLeague(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (name: string) =>
      apiSend<FantasyLeague>('POST', `/api/tournaments/${tournamentId}/fantasy/leagues`, { name }),
    onSuccess: () => invalidate(queryKeys.myLeagues(tournamentId)),
  })
}

// mutate(inviteCode) → POST /api/fantasy/leagues/join. Неверный код → 404.
export function useJoinLeague() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (inviteCode: string) =>
      apiSend<FantasyLeague>('POST', '/api/fantasy/leagues/join', { invite_code: inviteCode }),
    onSuccess: (league) => invalidate(queryKeys.myLeagues(league.tournament_id), queryKeys.leagueRating(league.id)),
  })
}

// Журнал начислений фэнтези-команды. Без roundId — за все закрытые туры.
export function useFantasyPoints(teamId: number, roundId?: number) {
  return useQuery({
    queryKey: queryKeys.fantasyPoints(teamId, roundId),
    queryFn: () =>
      apiGet<PointsEntry[]>(`/api/fantasy/teams/${teamId}/points${roundId === undefined ? '' : `?round_id=${roundId}`}`),
  })
}

// ---------- Администрирование (admin) ----------
// Мутации внутри турнира принимают tournamentId: по нему понятно, какой кэш устарел.
// Правка и удаление — mutate({ id, ...поля }) и mutate(id).

export function useCreateTournament() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: TournamentInput) => apiSend<Tournament>('POST', '/api/tournaments', body),
    onSuccess: () => invalidate(queryKeys.tournaments),
  })
}

// Название турнира есть и в матчах, и в командах.
export function useUpdateTournament() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<TournamentInput> & { id: number }) =>
      apiSend<Tournament>('PATCH', `/api/tournaments/${id}`, fields),
    onSuccess: () => invalidate(queryKeys.tournaments, queryKeys.matches, queryKeys.teams),
  })
}

export function useDeleteTournament() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => apiSend<void>('DELETE', `/api/tournaments/${id}`),
    onSuccess: () => invalidate(queryKeys.tournaments),
  })
}

export function useCreateRound(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: RoundInput) => apiSend<Round>('POST', `/api/tournaments/${tournamentId}/rounds`, body),
    onSuccess: () => invalidate(queryKeys.rounds(tournamentId)),
  })
}

// Название тура видно в матче, а от дедлайна зависит, можно ли менять состав.
export function useUpdateRound(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<RoundInput> & { id: number }) =>
      apiSend<Round>('PATCH', `/api/rounds/${id}`, fields),
    onSuccess: () => invalidate(queryKeys.rounds(tournamentId), queryKeys.matches, queryKeys.myLineups),
  })
}

export function useDeleteRound(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => apiSend<void>('DELETE', `/api/rounds/${id}`),
    onSuccess: () => invalidate(queryKeys.rounds(tournamentId), queryKeys.matches, queryKeys.myLineups),
  })
}

// mutate(roundId) → POST /api/rounds/{roundId}/close. Начисляет фэнтези-очки и фиксирует их.
// Не все матчи тура завершены или отменены → 409.
export function useCloseRound(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (roundId: number) => apiSend<Round>('POST', `/api/rounds/${roundId}/close`),
    onSuccess: () =>
      invalidate(queryKeys.rounds(tournamentId), queryKeys.fantasy(tournamentId), ['fantasy'], queryKeys.myLineups),
  })
}

// Календарь: матч меняет список матчей и таблицу турнира.
export function useCreateMatch(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (body: MatchInput) => apiSend<Match>('POST', `/api/tournaments/${tournamentId}/matches`, body),
    onSuccess: () => invalidate(queryKeys.tournament(tournamentId)),
  })
}

export function useUpdateMatch(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<MatchInput> & { id: number }) =>
      apiSend<Match>('PATCH', `/api/matches/${id}`, fields),
    onSuccess: (match) => invalidate(queryKeys.tournament(tournamentId), queryKeys.match(match.id)),
  })
}

// У матча уже есть события → 409: такой матч не удаляют, а отменяют.
export function useDeleteMatch(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => apiSend<void>('DELETE', `/api/matches/${id}`),
    onSuccess: () => invalidate(queryKeys.tournament(tournamentId)),
  })
}

// Название и логотип команды видны почти везде: в матчах, таблице, у игроков, в фэнтези.
export function useUpdateTeam(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...fields }: TeamUpdate & { id: number }) => apiSend<Team>('PATCH', `/api/teams/${id}`, fields),
    onSuccess: () => invalidate(queryKeys.tournament(tournamentId), queryKeys.teams, queryKeys.matches, queryKeys.players),
  })
}

// У команды есть матчи → 409.
export function useDeleteTeam(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => apiSend<void>('DELETE', `/api/teams/${id}`),
    onSuccess: () => invalidate(queryKeys.tournament(tournamentId), queryKeys.teams),
  })
}

// Имя и номер игрока видны в матчах, составах команд, лидерах и фэнтези, цена — в фэнтези.
export function useUpdatePlayer(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, ...fields }: PlayerUpdate & { id: number }) =>
      apiSend<Player>('PATCH', `/api/players/${id}`, fields),
    onSuccess: () =>
      invalidate(
        queryKeys.tournament(tournamentId),
        queryKeys.teams,
        queryKeys.players,
        queryKeys.matches,
        ['fantasy'],
        queryKeys.myLineups,
      ),
  })
}

// У игрока есть события → 409.
export function useDeletePlayer(tournamentId: number) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (id: number) => apiSend<void>('DELETE', `/api/players/${id}`),
    onSuccess: () => invalidate(queryKeys.tournament(tournamentId), queryKeys.teams, queryKeys.matches, queryKeys.myLineups),
  })
}
