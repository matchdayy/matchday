// Заглушка из каркаса. Экран оператора делается в задаче #42 —
// этот файл можно переписать целиком. Здесь только проверка, что запись работает:
// вход по коду, смена статуса, тестовый гол и удаление события.

import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { ApiError, USE_MOCKS, clearOperatorToken, getOperatorToken } from '../api/client'
import { useAddEvent, useChangeStatus, useDeleteEvent, useMatch, useOperatorCheck } from '../api/hooks'
import type { Match, MatchStatus } from '../api/types'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { MatchStatusBadge } from '../components/MatchStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

const STATUS_ACTIONS: Record<MatchStatus, { label: string; to: MatchStatus }[]> = {
  scheduled: [{ label: 'Начать', to: 'live' }],
  live: [
    { label: 'Перерыв', to: 'paused' },
    { label: 'Завершить', to: 'finished' },
  ],
  paused: [
    { label: 'Продолжить', to: 'live' },
    { label: 'Завершить', to: 'finished' },
  ],
  finished: [],
  cancelled: [],
}

export function OperatorMatchPage() {
  const [token, setToken] = useState(getOperatorToken)

  const logout = () => {
    clearOperatorToken()
    setToken(null)
  }

  if (!token) return <TokenForm onSuccess={setToken} />
  return <OperatorPanel onLogout={logout} />
}

function TokenForm({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [code, setCode] = useState('')
  const check = useOperatorCheck()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    check.mutate(code, { onSuccess: () => onSuccess(code) })
  }

  return (
    <>
      <PageHeader title="Вход оператора" />
      <PlaceholderNote />
      <form className="stack" onSubmit={submit}>
        <label className="stack">
          Код оператора
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {USE_MOCKS && <p className="text-muted">В режиме моков код: dev-operator</p>}
        {check.isError && <ErrorState error={check.error} title="Код не подошёл" />}
        <button type="submit" className="button button--primary" disabled={check.isPending || !code}>
          Войти
        </button>
      </form>
    </>
  )
}

function OperatorPanel({ onLogout }: { onLogout: () => void }) {
  const id = Number(useParams().id)
  const match = useMatch(id)
  const addEvent = useAddEvent(id)
  const deleteEvent = useDeleteEvent(id)
  const changeStatus = useChangeStatus(id)

  const mutationError = addEvent.error ?? deleteEvent.error ?? changeStatus.error
  // Код отозвали или он неверный — возвращаем на ввод кода.
  useEffect(() => {
    if (mutationError instanceof ApiError && mutationError.status === 401) onLogout()
  }, [mutationError, onLogout])

  if (match.isPending) return <Loading />
  if (match.isError) return <ErrorState error={match.error} onRetry={() => match.refetch()} />

  const { data } = match
  const canAddEvents = data.status === 'live' || data.status === 'paused'

  return (
    <>
      <PageHeader
        title={`${data.home_team.name} ${data.score?.home ?? '—'} : ${data.score?.away ?? '—'} ${data.away_team.name}`}
        actions={<MatchStatusBadge status={data.status} />}
      />
      <PlaceholderNote />

      <div className="stack">
        {STATUS_ACTIONS[data.status].map((action) => (
          <button
            key={action.to}
            type="button"
            className="button button--primary"
            disabled={changeStatus.isPending}
            onClick={() => changeStatus.mutate(action.to)}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          className="button"
          disabled={!canAddEvents || addEvent.isPending || data.home_players.length === 0}
          onClick={() => addEvent.mutate(testGoal(data))}
        >
          Тестовый гол хозяев
        </button>
        {mutationError && <ErrorState error={mutationError} title="Не сохранилось" />}
      </div>

      <section className="section">
        <h2>Лента</h2>
        <ul className="list">
          {[...data.events].reverse().map((event) => (
            <li key={event.id} className="row">
              <span>
                {event.minute}′ {event.type} — {event.player.full_name}
              </span>
              <button
                type="button"
                className="button"
                disabled={deleteEvent.isPending}
                onClick={() => deleteEvent.mutate(event.id)}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="button" onClick={onLogout}>
        Выйти
      </button>
    </>
  )
}

// Гол первого игрока хозяев на минуту позже последнего события — только для проверки записи.
function testGoal(match: Match) {
  const lastMinute = match.events[match.events.length - 1]?.minute ?? 0
  return { type: 'goal' as const, minute: lastMinute + 1, player_id: match.home_players[0].id }
}
