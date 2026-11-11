// Заглушка. Экран лиги делается отдельной задачей — этот файл можно переписать целиком.
// Ручки «лига по id» в контракте нет: название и код лиги берите из useMyLeagues(tournamentId),
// а здесь — только её рейтинг.

import { useParams } from 'react-router'
import { useLeagueRating } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PlaceholderNote } from '../components/PlaceholderNote'
import { RatingList } from '../components/fantasy/RatingList'

export function FantasyLeaguePage() {
  const id = Number(useParams().id)
  const rating = useLeagueRating(id)

  return (
    <>
      <PageHeader title="Рейтинг лиги" />
      <PlaceholderNote />
      {rating.isPending && <Loading />}
      {rating.isError && <ErrorState error={rating.error} onRetry={() => rating.refetch()} />}
      {rating.data && <RatingList rows={rating.data} />}
    </>
  )
}
