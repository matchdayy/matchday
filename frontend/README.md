# Фронтенд Матчдея

React 19 + TypeScript + Vite. Маршруты — `react-router`, данные — `@tanstack/react-query`.
UI-библиотек нет: всё на своих компонентах и CSS-переменных.

## Запуск на моках

Моки — это поддельный бэкенд внутри фронтенда. С ними экран можно делать сразу,
не дожидаясь ручек API.

1. Создайте файл `frontend/.env.local` (в git он не попадает):
   ```bash
   cp frontend/.env.example frontend/.env.local
   ```
2. Поставьте в нём `VITE_USE_MOCKS=true`.
3. Запустите всё как обычно: `docker compose up`. Если фронтенд уже был запущен —
   `docker compose restart frontend`.

Внизу страницы должна появиться надпись «Данные: моки».
Чтобы вернуться к настоящему API, поставьте `VITE_USE_MOCKS=false`.

Что умеют моки:

- данные — из `backend/fixtures/demo.json`: турнир «Кубок ITMO», 4 команды, 6 матчей;
  плюс два пустых турнира, чтобы были видны пустые состояния;
- запись работает: на экране оператора можно менять статус, добавлять и удалять
  события, и остальные экраны сразу видят новый счёт;
- код оператора в моках — `dev-operator`;
- после перезагрузки страницы всё возвращается к исходным данным.

Удобные адреса для проверки: `/tournaments/1`, `/matches/4` (идущий матч),
`/operator/matches/4`, `/teams/1`, `/players/9`.

## Где писать свой экран

```
src/
  pages/XPage.tsx         страница экрана — один файл на экран
  components/<экран>/     компоненты только этого экрана
  components/             общие: Loading, ErrorState, EmptyState, PageHeader,
                          TeamName, MatchStatusBadge
  api/hooks.ts            хуки данных — берите данные только через них
  api/types.ts            типы ответов API (контракт с бэкендом)
  index.css               CSS-переменные: цвета, отступы, скругления, шрифт
```

Страницы в `pages/` сейчас — заглушки с жёлтой плашкой. Свой экран пишите прямо
поверх заглушки, её можно стереть целиком. Компоненты кладите в свою папку
`components/<экран>/` — так несколько человек не правят одни и те же файлы.

Цвета и отступы — только через переменные из `index.css`, например
`color: var(--color-text-muted)` или `padding: var(--space-4)`.
Если нужной переменной не хватает — напишите руководителю.

Проверяйте экран на ширине 375 px (DevTools → телефон): горизонтальной прокрутки
страницы быть не должно.

## Главное правило

**Счёт, турнирную таблицу и статистику на фронтенде не считаем.** Бэкенд считает
их по ленте событий и отдаёт готовыми: `match.score`, `TableRow.points`,
`player.stats`. Фронтенд их только показывает. Иначе цифры на разных экранах
рано или поздно разойдутся.

## Как взять данные

```tsx
import { useParams } from 'react-router'
import { useTeam } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { Loading } from '../components/Loading'

export function TeamPage() {
  const id = Number(useParams().id)
  const team = useTeam(id)

  if (team.isPending) return <Loading />
  if (team.isError) return <ErrorState error={team.error} onRetry={() => team.refetch()} />

  return <h1>{team.data.name}</h1>
}
```

Хук сам ходит в API (или в моки), кэширует ответ и обновляет данные.
`fetch` на страницах напрямую не вызываем.

Запись — через хуки-мутации, после успеха они сами обновляют матч:

```tsx
const addEvent = useAddEvent(matchId)
addEvent.mutate({ type: 'goal', minute: 37, player_id: 12 })
// addEvent.isPending — запрос идёт, addEvent.error — не сохранилось
```

Все хуки: `useTournaments`, `useTournament`, `useTournamentTable`,
`useTournamentMatches`, `useTournamentScorers`, `useTournamentAssists`, `useMatch`,
`useTeam`, `usePlayer`, `useAddEvent`, `useDeleteEvent`, `useChangeStatus`,
`useOperatorCheck`.

`useMatch` сам обновляет данные каждые 3 секунды, пока матч идёт или на перерыве.

## Проверка перед пулл-реквестом

```bash
docker compose exec frontend npm run build
```

Должно пройти без ошибок — то же самое проверяет CI.
