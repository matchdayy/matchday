// Заглушка из каркаса. Экран оператора делается в задаче #42 —
// этот файл можно переписать целиком. Здесь только проверка, что запись работает:
// смена статуса, тестовый гол и удаление события.
// Вход проверяет RequireRole в App.tsx: сюда попадают только оператор и администратор.

import { useParams } from 'react-router'
import { newClientId } from '../api/client'
import { useAddEvent, useChangeStatus, useDeleteEvent, useMatch } from '../api/hooks'
import type { Match, MatchStatus, NewEvent } from '../api/types'
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
  const id = Number(useParams().id)
  const match = useMatch(id)
  const addEvent = useAddEvent(id)
  const deleteEvent = useDeleteEvent(id)
  const changeStatus = useChangeStatus(id)

  const mutationError = addEvent.error ?? deleteEvent.error ?? changeStatus.error

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
      {data.clock && (
        <p className="text-muted">
          Игровое время: {data.clock.minute}′ {data.clock.running ? '(идёт)' : '(остановлено)'}
          {data.round && ` · ${data.round.title}`}
        </p>
      )}

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
    </>
  )
}

// Гол первого игрока хозяев — только для проверки записи. Минуту не передаём:
// сервер подставит её по игровому времени. client_id защищает от задвоения при повторе.
function testGoal(match: Match): NewEvent {
  return { type: 'goal', player_id: match.home_players[0].id, client_id: newClientId() }
}
