// Заглушка из каркаса. Экран игрока делается в задаче #43 —
// этот файл можно переписать целиком.

import { useParams } from 'react-router'
import { usePlayer } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { TeamName } from '../components/TeamName'

export function PlayerPage() {
  const id = Number(useParams().id)
  const player = usePlayer(id)

  if (player.isPending) return <Loading />
  if (player.isError) return <ErrorState error={player.error} onRetry={() => player.refetch()} />

  const { data } = player
  // stats может ещё не прийти с бэкенда — тогда прочерк, а не ноль.
  const stats = data.stats

  return (
    <>
      <PageHeader
        title={data.full_name}
        subtitle={
          <>
            №{data.number ?? '—'} · {data.position ?? 'позиция не указана'} · <TeamName team={data.team} link />
          </>
        }
      />
      <PlaceholderNote />

      <section className="section">
        <h2>Статистика</h2>
        <ul className="list">
          <li>Голы: {stats?.goals ?? '—'}</li>
          <li>Передачи: {stats?.assists ?? '—'}</li>
          <li>Жёлтые карточки: {stats?.yellow_cards ?? '—'}</li>
          <li>Красные карточки: {stats?.red_cards ?? '—'}</li>
        </ul>
      </section>
    </>
  )
}
