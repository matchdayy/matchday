import type { MatchStatus } from '../api/types'

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Запланирован',
  live: 'Идёт',
  paused: 'Перерыв',
  finished: 'Завершён',
  cancelled: 'Отменён',
}

type Props = {
  status: MatchStatus
}

export function MatchStatusBadge({ status }: Props) {
  return <span className={`badge badge--${status}`}>{MATCH_STATUS_LABELS[status]}</span>
}
