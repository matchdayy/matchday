import { QueryClient } from '@tanstack/react-query'
import { ApiError, onAccessTokenChange } from './client'
import { resetUserData } from './hooks'

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

// Вошли, вышли или токен протух — данные прошлого пользователя показывать нельзя.
onAccessTokenChange((token) => resetUserData(queryClient, token))
