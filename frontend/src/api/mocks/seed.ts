// Демо-данные фэнтези и голосования. Собираются теми же функциями, что обрабатывают запросы:
// составы проходят обычную проверку, а журнал очков первого тура появляется
// при его настоящем закрытии. Если правила поменяются и демо-состав станет неверным,
// моки упадут сразу при загрузке, а не где-то на экране.

import { DAY_MS, LOADED_AT, db } from './db'
import { saveLineupRow, validateLineup } from './fantasy'
import { closeRound } from './rounds'

const VIEWER_ID = 1
const OPERATOR_ID = 2
const ADMIN_ID = 3
const DEMO_TOURNAMENT_ID = 1
const FIRST_ROUND_ID = 1

export function seedDemoData(): void {
  // Две фэнтези-команды: у зрителя и у оператора. У администратора команды нет —
  // на нём удобно проверять создание команды и вступление в лигу по коду.
  db.fantasyTeams.push(
    { id: 1, tournament_id: DEMO_TOURNAMENT_ID, owner_id: VIEWER_ID, name: 'Северный ветер' },
    { id: 2, tournament_id: DEMO_TOURNAMENT_ID, owner_id: OPERATOR_ID, name: 'Ночная смена' },
  )

  // Составы на первый тур: по 48 из 50, не больше двух игроков из одной команды.
  // На второй тур составов нет — при его закрытии возьмутся эти.
  saveLineupRow(1, FIRST_ROUND_ID, validateLineup(DEMO_TOURNAMENT_ID, [9, 6, 11, 25, 33]))
  saveLineupRow(2, FIRST_ROUND_ID, validateLineup(DEMO_TOURNAMENT_ID, [29, 31, 12, 3, 36]))

  // Закрыт на следующий день после последнего матча тура.
  closeRound(FIRST_ROUND_ID, new Date(LOADED_AT - 6 * DAY_MS).toISOString())

  db.leagues.push({
    id: 1,
    tournament_id: DEMO_TOURNAMENT_ID,
    name: 'Лига третьего этажа',
    invite_code: 'ETAZH3',
    member_team_ids: [1, 2],
  })

  // Матч 1 закончился давно — голосование закрыто, победитель есть.
  // Матч 3 закончился час назад — голосование открыто, зритель ещё не голосовал.
  db.votes.push(
    { match_id: 1, user_id: VIEWER_ID, player_id: 9 },
    { match_id: 1, user_id: OPERATOR_ID, player_id: 9 },
    { match_id: 1, user_id: ADMIN_ID, player_id: 6 },
    { match_id: 3, user_id: OPERATOR_ID, player_id: 10 },
  )
}
