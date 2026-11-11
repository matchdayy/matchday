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

### Вход в моках

В моках есть три демо-пользователя, пароль у всех — `demo`:

| Почта | Роль | Что видно |
|---|---|---|
| `viewer@demo.local` | зритель | своя фэнтези-команда, состав, лига, голосование |
| `operator@demo.local` | оператор | всё, что зритель, плюс экран оператора матча |
| `admin@demo.local` | администратор | всё, плюс `/admin`; фэнтези-команды нет — на нём удобно проверять её создание и вход в лигу |

Эти почты и пароль существуют **только в моках**. На настоящем бэкенде их нет.
Регистрация в моках тоже работает, но новый пользователь пропадёт после
перезагрузки страницы — тогда приложение само «выйдет».

### Что умеют моки

- данные — из `backend/fixtures/demo.json`: турнир «Кубок ITMO», 4 команды, 6 матчей;
  плюс два пустых турнира, чтобы были видны пустые состояния;
- роли как на бэкенде: без входа закрытая ручка отвечает `401`, с недостаточной ролью — `403`;
- запись работает: на экране оператора можно менять статус, добавлять, править и удалять
  события, и остальные экраны сразу видят новый счёт;
- игровое время (`match.clock`) считается по журналу смен статуса, перерывы не считаются.
  У идущего матча 4 на часах около 41-й минуты, хотя начался он 50 минут назад;
- повторный `POST` события с тем же `client_id` не создаёт второе событие;
- фэнтези: цены игроков от 7 до 14, бюджет 50, 5 игроков, не больше двух из одной команды.
  Тур 1 закрыт, по нему есть журнал очков. Тур 2 открыт, его дедлайн — через 3 дня
  после загрузки страницы. Две фэнтези-команды (у зрителя и оператора) и лига
  «Лига третьего этажа» с кодом `ETAZH3`;
- голосование: у матча 1 оно закрыто и есть победитель, у матча 3 открыто
  (матч «закончился» час назад), зритель там ещё не голосовал;
- после перезагрузки страницы всё возвращается к исходным данным.

Удобные адреса для проверки: `/tournaments/1`, `/matches/4` (идущий матч),
`/matches/3` (открытое голосование), `/operator/matches/4`, `/teams/1`, `/players/9`,
`/tournaments/1/fantasy`, `/tournaments/1/fantasy/rating`, `/fantasy/leagues/1`,
`/fantasy/teams/1/points`, `/admin`, `/admin/tournaments/1`, `/admin/users`, `/me`.

## Где писать свой экран

**Правило: один экран — свой файл в `pages/` и своя папка `components/<экран>/`.**
Так несколько человек не правят одни и те же файлы и не ловят конфликты.

```
src/
  pages/XPage.tsx         страница экрана — один файл на экран
  components/<экран>/     компоненты только этого экрана: components/fantasy/, components/votes/ …
  components/             общие: Loading, ErrorState, EmptyState, PageHeader,
                          TeamName, MatchStatusBadge, RequireRole
  api/hooks.ts            хуки данных — берите данные только через них
  api/types.ts            типы ответов API (контракт с бэкендом)
  api/roles.ts            hasRole и подписи ролей
  index.css               CSS-переменные: цвета, отступы, скругления, шрифт
```

Страницы в `pages/` сейчас — заглушки с жёлтой плашкой. Свой экран пишите прямо
поверх заглушки, её можно стереть целиком. Если экран — блок внутри чужой страницы
(как голосование внутри страницы матча), он живёт в своей папке:
`components/votes/MatchVotes.tsx` уже вставлен в `MatchPage` одной строкой.

Адреса заглушек:

| Адрес | Файл | Кто может открыть |
|---|---|---|
| `/login`, `/register` | `LoginPage`, `RegisterPage` | все |
| `/me` | `MePage` | любой вошедший |
| `/tournaments/:id/fantasy` | `FantasyPage` — состав | любой вошедший |
| `/tournaments/:id/fantasy/rating` | `FantasyRatingPage` | все |
| `/fantasy/leagues/:id` | `FantasyLeaguePage` | все |
| `/fantasy/teams/:id/points` | `FantasyPointsPage` | все |
| `/operator/matches/:id` | `OperatorMatchPage` | оператор, администратор |
| `/admin`, `/admin/tournaments/:id`, `/admin/users` | `AdminPage`, `AdminTournamentPage`, `AdminUsersPage` | администратор |

Цвета и отступы — только через переменные из `index.css`, например
`color: var(--color-text-muted)` или `padding: var(--space-4)`.
Если нужной переменной не хватает — напишите руководителю.

Проверяйте экран на ширине 375 px (DevTools → телефон): горизонтальной прокрутки
страницы быть не должно.

## Главное правило

**Счёт, турнирную таблицу, статистику, игровое время и фэнтези-очки на фронтенде
не считаем.** Бэкенд считает их и отдаёт готовыми: `match.score`, `match.clock`,
`TableRow.points`, `player.stats`, `RatingRow.points`. Фронтенд их только показывает.
Иначе цифры на разных экранах рано или поздно разойдутся. Между опросами сервера
часы матча можно вести на экране самим, пока `clock.running = true`.

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

Запись — через хуки-мутации, после успеха они сами обновляют всё, что изменилось:

```tsx
const addEvent = useAddEvent(matchId)
addEvent.mutate({ type: 'goal', minute: 37, player_id: 12 })
// addEvent.isPending — запрос идёт, addEvent.error — не сохранилось
```

Текст ошибки от сервера — в `error.detail` (его показывает `ErrorState`),
код — в `error.status`: `401` — нужно войти, `403` — роль не та,
`409` — так нельзя сейчас (дедлайн прошёл, уже голосовал), `422` — неверные данные.

## Вход и роли

Токен хранится в `localStorage`, `api/client.ts` сам добавляет его в каждый запрос
как `Authorization: Bearer …`. Если сервер ответил `401` на запрос с токеном, токен
стирается, и приложение показывает пользователя как гостя.

```tsx
const me = useMe()
// me.data — User, если вошёл, и null, если нет
```

Закрыть страницу по роли — в `App.tsx`, обернув маршрут в `RequireRole`:

```tsx
<Route element={<RequireRole role="operator" />}>
  <Route path="operator/matches/:id" element={<OperatorMatchPage />} />
</Route>
```

Без входа `RequireRole` отправит на `/login?next=<адрес>` и после входа вернёт
обратно, с недостаточной ролью — покажет сообщение. Администратор проходит везде,
куда пускают оператора. Показать или спрятать кнопку по роли — `hasRole(me.data, 'admin')`
из `api/roles.ts`.

## Все хуки

Чтение (`useQuery`): данные в `.data`, загрузка — `.isPending`, ошибка — `.isError`.

| Хук | Что отдаёт |
|---|---|
| `useMe()` | `User` или `null`, если не вошёл |
| `useUsers()` | все пользователи (admin) |
| `useTournaments()`, `useTournament(id)` | турниры |
| `useTournamentTable(id)`, `useTournamentMatches(id)` | таблица, матчи турнира |
| `useTournamentScorers(id)`, `useTournamentAssists(id)` | бомбардиры, ассистенты |
| `useTournamentTeams(id)` | команды турнира с числом игроков |
| `useRounds(tournamentId)` | туры |
| `useMatch(id)` | матч с лентой, `clock` и `round`; сам обновляется каждые 3 с, пока матч идёт |
| `useTeam(id)`, `usePlayer(id)` | команда, игрок |
| `useMatchVotes(matchId)` | итоги голосования, мой голос |
| `useFantasyRules()` | размер состава, бюджет, очки |
| `useFantasyPlayers(tournamentId)` | игроки с ценами |
| `useMyFantasyTeam(tournamentId)` | моя команда или `null`, если не создана |
| `useMyLineup(roundId)` | мой состав на тур или `null`, если не присылал |
| `useFantasyRating(tournamentId)`, `useLeagueRating(leagueId)` | рейтинги |
| `useMyLeagues(tournamentId)` | мои лиги с кодами приглашения |
| `useFantasyPoints(teamId, roundId?)` | журнал очков, без `roundId` — за все туры |
| `useHealth()` | ответ `/api/health` |

Запись (`useMutation`): вызвать — `.mutate(...)`, идёт — `.isPending`, ошибка — `.error`.

| Хук | Как вызвать |
|---|---|
| `useLogin()` | `mutate({ email, password })` |
| `useRegister()` | `mutate({ email, password, display_name, pd_consent })` |
| `useLogout()` | `const logout = useLogout(); logout()` — это не мутация |
| `useDeleteAccount()` | `mutate()` — удаляет аккаунт, спросите подтверждение |
| `useChangeRole()` | `mutate({ userId, role })` |
| `useAddEvent(matchId)` | `mutate({ type, player_id, minute?, assist_player_id?, is_own_goal?, client_id? })` |
| `useUpdateEvent(matchId)` | `mutate({ id, ...поля })` |
| `useDeleteEvent(matchId)` | `mutate(eventId)` |
| `useChangeStatus(matchId)` | `mutate('live')` |
| `useVote(matchId)` | `mutate(playerId)` |
| `useCreateFantasyTeam(tournamentId)` | `mutate(name)` |
| `useSaveLineup(roundId)` | `mutate([id1, id2, id3, id4, id5])` |
| `useCreateLeague(tournamentId)` | `mutate(name)` |
| `useJoinLeague()` | `mutate(inviteCode)` |
| `useCreateTournament()` | `mutate({ name, sport, start_date, end_date })` |
| `useUpdateTournament()` | `mutate({ id, ...поля })` |
| `useDeleteTournament()` | `mutate(id)` |
| `useCreateRound(tournamentId)` | `mutate({ number, title, deadline })` |
| `useUpdateRound(tournamentId)` | `mutate({ id, ...поля })` |
| `useDeleteRound(tournamentId)` | `mutate(id)` |
| `useCloseRound(tournamentId)` | `mutate(roundId)` — начисляет фэнтези-очки |
| `useCreateMatch(tournamentId)` | `mutate({ home_team_id, away_team_id, starts_at, venue, round_id })` |
| `useUpdateMatch(tournamentId)` | `mutate({ id, ...поля })` |
| `useDeleteMatch(tournamentId)` | `mutate(id)` |
| `useUpdateTeam(tournamentId)` | `mutate({ id, name?, logo_url? })` |
| `useDeleteTeam(tournamentId)` | `mutate(id)` |
| `useUpdatePlayer(tournamentId)` | `mutate({ id, full_name?, number?, position?, photo_url?, price? })` |
| `useDeletePlayer(tournamentId)` | `mutate(id)` |

### Офлайн-очередь оператора

Каждому событию в очереди дайте `client_id: newClientId()` из `api/client.ts` и
отправляйте его с тем же `client_id` столько раз, сколько нужно: сервер не создаст
второе событие, а вернёт уже созданное. `newClientId()` работает и на телефоне,
открытом по `http://` в локальной сети, где `crypto.randomUUID` нет.
Если минуту не передать, сервер подставит текущую минуту игрового времени — но на момент,
когда запрос до него дошёл. Событие из очереди может дойти позже, поэтому в очереди
минуту лучше запоминать в момент нажатия кнопки.

## Проверка перед пулл-реквестом

```bash
docker compose exec frontend npm run build
```

Должно пройти без ошибок — то же самое проверяет CI.
