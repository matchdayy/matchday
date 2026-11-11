import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 404, 401 и ошибки валидации повтором не лечатся — сразу показываем ошибку.
      // Сетевые сбои и 5xx пробуем ещё пару раз.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 2
      },
    },
  },
})
