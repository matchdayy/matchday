import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { MatchPage } from './pages/MatchPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OperatorMatchPage } from './pages/OperatorMatchPage'
import { PlayerPage } from './pages/PlayerPage'
import { TeamPage } from './pages/TeamPage'
import { TournamentPage } from './pages/TournamentPage'
import { TournamentsPage } from './pages/TournamentsPage'

// Все адреса приложения. Новый экран — новая строка здесь и файл в pages/.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TournamentsPage />} />
          <Route path="tournaments/:id" element={<TournamentPage />} />
          <Route path="matches/:id" element={<MatchPage />} />
          <Route path="operator/matches/:id" element={<OperatorMatchPage />} />
          <Route path="teams/:id" element={<TeamPage />} />
          <Route path="players/:id" element={<PlayerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
