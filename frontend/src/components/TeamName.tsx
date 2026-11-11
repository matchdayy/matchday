import { Link } from 'react-router'
import type { TeamShort } from '../api/types'

type Props = {
  team: TeamShort
  // true — название ведёт на страницу команды
  link?: boolean
}

export function TeamName({ team, link = false }: Props) {
  const content = (
    <>
      {team.logo_url && <img className="team-name__logo" src={team.logo_url} alt="" />}
      <span>{team.name}</span>
    </>
  )

  if (link) {
    return (
      <Link className="team-name" to={`/teams/${team.id}`}>
        {content}
      </Link>
    )
  }
  return <span className="team-name">{content}</span>
}
