import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { RequireRole } from './components/RequireRole'
import { AdminPage } from './pages/AdminPage'
import { AdminTournamentPage } from './pages/AdminTournamentPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { FantasyLeaguePage } from './pages/FantasyLeaguePage'
import { FantasyPage } from './pages/FantasyPage'
import { FantasyPointsPage } from './pages/FantasyPointsPage'
import { FantasyRatingPage } from './pages/FantasyRatingPage'
import { LoginPage } from './pages/LoginPage'
import { MatchPage } from './pages/MatchPage'
import { MePage } from './pages/MePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OperatorMatchPage } from './pages/OperatorMatchPage'
import { PlayerPage } from './pages/PlayerPage'
import { RegisterPage } from './pages/RegisterPage'
import { TeamPage } from './pages/TeamPage'
import { TournamentPage } from './pages/TournamentPage'
import { TournamentsPage } from './pages/TournamentsPage'

// Все адреса приложения. Новый экран — новая строка здесь и файл в pages/.
// Закрытые страницы лежат внутри <RequireRole>: без входа он отправит на /login,
// а с недостаточной ролью покажет понятное сообщение.
// useTransitions={false}: переход по адресу применяется сразу. Иначе при выходе из аккаунта
// на закрытой странице RequireRole успевает увидеть «гостя» раньше, чем сменится адрес,
// и уводит на /login вместо главной.
export function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TournamentsPage />} />
          <Route path="tournaments/:id" element={<TournamentPage />} />
          <Route path="tournaments/:id/fantasy/rating" element={<FantasyRatingPage />} />
          <Route path="matches/:id" element={<MatchPage />} />
          <Route path="teams/:id" element={<TeamPage />} />
          <Route path="players/:id" element={<PlayerPage />} />
          <Route path="fantasy/leagues/:id" element={<FantasyLeaguePage />} />
          <Route path="fantasy/teams/:id/points" element={<FantasyPointsPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />

          <Route element={<RequireRole role="viewer" />}>
            <Route path="me" element={<MePage />} />
            <Route path="tournaments/:id/fantasy" element={<FantasyPage />} />
          </Route>

          <Route element={<RequireRole role="operator" />}>
            <Route path="operator/matches/:id" element={<OperatorMatchPage />} />
          </Route>

          <Route element={<RequireRole role="admin" />}>
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/tournaments/:id" element={<AdminTournamentPage />} />
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
