import { ApiError } from '../api/client'

type Props = {
  error: Error | null
  // Обычно сюда передают refetch из хука: onRetry={() => query.refetch()}
  onRetry?: () => void
  title?: string
}

export function ErrorState({ error, onRetry, title = 'Не удалось загрузить данные' }: Props) {
  // Текст от сервера понятен человеку, а сообщения прочих ошибок — технические.
  const detail = error instanceof ApiError ? error.detail : null

  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{title}</p>
      {detail && <p className="state__text">{detail}</p>}
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  )
}
