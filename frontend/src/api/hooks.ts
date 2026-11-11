// Хуки данных. Одинаково работают с моками и с настоящим API.
// Счёт, таблицу и статистику считает бэкенд — здесь и на страницах их не пересчитываем.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend, checkOperatorToken, clearOperatorToken, saveOperatorToken, ApiError } from './client'
import type {
  AssistRow,
  Match,
  MatchEvent,
  MatchShort,
  MatchStatus,
  NewEvent,
  Player,
  ScorerRow,
  StatusChange,
  TableRow,
  Team,
  Tournament,
} from './types'

// По ТЗ событие, внесённое оператором, должно появиться у зрителя не позже чем
// через 5 секунд. Опрос раз в 3 секунды оставляет запас на сам запрос.
export const MATCH_POLL_INTERVAL_MS = 3000

// Ключи кэша. Мутации по ним понимают, какие данные устарели.
export const queryKeys = {
  health: ['health'] as const,
  tournaments: ['tournaments'] as const,
  tournament: (id: number) => ['tournaments', id] as const,
  tournamentTable: (id: number) => ['tournaments', id, 'table'] as const,
  tournamentMatches: (id: number) => ['tournaments', id, 'matches'] as const,
  tournamentScorers: (id: number) => ['tournaments', id, 'scorers'] as const,
  tournamentAssists: (id: number) => ['tournaments', id, 'assists'] as const,
  match: (id: number) => ['matches', id] as const,
  team: (id: number) => ['teams', id] as const,
  player: (id: number) => ['players', id] as const,
}

// ---------- Чтение ----------

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

// ---------- Запись (экран оператора) ----------

// После записи устаревают матч, а вместе с ним таблица, список матчей,
// бомбардиры и статистика игроков.
function useInvalidateAfterMatchChange(matchId: number) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.match(matchId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments }),
      queryClient.invalidateQueries({ queryKey: ['players'] }),
    ])
}

// mutate(newEvent) → POST /api/matches/{matchId}/events
export function useAddEvent(matchId: number) {
  const invalidate = useInvalidateAfterMatchChange(matchId)
  return useMutation({
    mutationFn: (event: NewEvent) => apiSend<MatchEvent>('POST', `/api/matches/${matchId}/events`, event),
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

// mutate(code): проверяет код и при успехе сохраняет его в localStorage,
// после чего apiSend сам подставляет его в запросы. Неверный код стирается.
export function useOperatorCheck() {
  return useMutation({
    mutationFn: async (token: string) => {
      try {
        await checkOperatorToken(token)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) clearOperatorToken()
        throw error
      }
      saveOperatorToken(token)
    },
  })
}
