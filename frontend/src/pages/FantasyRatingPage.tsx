// Заглушка. Экран рейтинга фэнтези делается отдельной задачей — этот файл можно переписать целиком.
// Рейтинг открыт всем, входить не нужно.

import { Link, useParams } from 'react-router'
import { useFantasyRating, useTournament } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { RatingList } from '../components/fantasy/RatingList'

export function FantasyRatingPage() {
  const id = Number(useParams().id)
  const tournament = useTournament(id)
  const rating = useFantasyRating(id)

  return (
    <>
      <PageHeader
        title="Рейтинг фэнтези"
        subtitle={tournament.data && <Link to={`/tournaments/${id}/fantasy`}>{tournament.data.name}</Link>}
      />
      <PlaceholderNote />
      {rating.isPending && <Loading />}
      {rating.isError && <ErrorState error={rating.error} onRetry={() => rating.refetch()} />}
      {rating.data && <RatingList rows={rating.data} />}
    </>
  )
}
