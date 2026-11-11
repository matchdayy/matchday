// Заглушка. Экран журнала очков делается отдельной задачей — этот файл можно переписать целиком.
// Очки появляются только у закрытых туров. Чтобы показать один тур, передайте его id
// вторым аргументом: useFantasyPoints(teamId, roundId).

import { Link, useParams } from 'react-router'
import { useFantasyPoints } from '../api/hooks'
import type { PointsReason } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'

const REASON_LABELS: Record<PointsReason, string> = {
  goal: 'гол',
  assist: 'передача',
  played: 'сыграл матч',
  yellow_card: 'жёлтая карточка',
  red_card: 'красная карточка',
  own_goal: 'автогол',
}

export function FantasyPointsPage() {
  const id = Number(useParams().id)
  const points = useFantasyPoints(id)

  return (
    <>
      <PageHeader title="Журнал очков" />
      <PlaceholderNote />
      {points.isPending && <Loading />}
      {points.isError && <ErrorState error={points.error} onRetry={() => points.refetch()} />}
      {points.data?.length === 0 && <EmptyState>Очков пока нет: они начисляются при закрытии тура</EmptyState>}
      {points.data && points.data.length > 0 && (
        <ul className="list">
          {points.data.map((entry) => (
            <li key={entry.id}>
              Тур {entry.round_id}, <Link to={`/matches/${entry.match_id}`}>матч</Link>
              {entry.minute !== null && `, ${entry.minute}′`}: {entry.player.full_name} — {REASON_LABELS[entry.reason]},{' '}
              {entry.points > 0 ? `+${entry.points}` : entry.points}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
