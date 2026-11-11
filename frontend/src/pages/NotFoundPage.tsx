import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Страница не найдена" />
      <p>
        Такой страницы нет. <Link to="/">К списку турниров</Link>
      </p>
    </>
  )
}
