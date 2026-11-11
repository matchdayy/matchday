// Список рейтинга из заглушек: общий рейтинг турнира и рейтинг лиги выглядят одинаково.
// Можно переделать или удалить вместе с заглушками.

import { Link } from 'react-router'
import type { RatingRow } from '../../api/types'
import { EmptyState } from '../EmptyState'

export function RatingList({ rows }: { rows: RatingRow[] }) {
  if (rows.length === 0) return <EmptyState>Фэнтези-команд пока нет</EmptyState>

  return (
    <ol className="list">
      {rows.map((row) => (
        <li key={row.fantasy_team.id}>
          {row.position}.{' '}
          <Link to={`/fantasy/teams/${row.fantasy_team.id}/points`}>{row.fantasy_team.name}</Link> (
          {row.fantasy_team.owner.display_name}) — {row.points} очк., за последний тур {row.last_round_points}
        </li>
      ))}
    </ol>
  )
}
