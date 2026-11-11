import asyncio

from fastapi.testclient import TestClient

from app.services.player_stats import PlayerStats, load_player_stats
from tests.conftest import SampleTournament, session_maker

MISSING_ID = 999_999_999


def test_list_contains_tournament(
    client: TestClient, sample_tournament: SampleTournament
):
    response = client.get("/api/tournaments")

    assert response.status_code == 200
    ids = [tournament["id"] for tournament in response.json()]
    assert sample_tournament.tournament.id in ids


def test_get_tournament(client: TestClient, sample_tournament: SampleTournament):
    tournament = sample_tournament.tournament

    response = client.get(f"/api/tournaments/{tournament.id}")

    assert response.status_code == 200
    assert response.json() == {
        "id": tournament.id,
        "name": "Тестовый кубок",
        "sport": "football",
        "start_date": tournament.start_date.isoformat(),
        "end_date": tournament.end_date.isoformat(),
        "status": "ongoing",
    }


def test_missing_tournament_returns_404(client: TestClient):
    for path in ["", "/table", "/matches", "/scorers", "/assists"]:
        response = client.get(f"/api/tournaments/{MISSING_ID}{path}")

        assert response.status_code == 404, path
        assert response.json() == {"detail": "Турнир не найден"}


def test_table(client: TestClient, sample_tournament: SampleTournament):
    alpha = sample_tournament.teams["Альфа"]

    response = client.get(f"/api/tournaments/{sample_tournament.tournament.id}/table")

    assert response.status_code == 200
    table = response.json()
    # Гамма выше Беты: очков у обеих 0, но разница у Гаммы 0, а у Беты −1.
    assert [row["team"]["name"] for row in table] == ["Альфа", "Гамма", "Бета"]
    assert table[0] == {
        "position": 1,
        "team": {"id": alpha.id, "name": "Альфа", "logo_url": None},
        "played": 1,
        "won": 1,
        "drawn": 0,
        "lost": 0,
        "goals_for": 2,
        "goals_against": 1,
        "goal_diff": 1,
        "points": 3,
    }
    assert table[1]["played"] == 0


def test_matches_sorted_by_start_with_score(
    client: TestClient, sample_tournament: SampleTournament
):
    response = client.get(f"/api/tournaments/{sample_tournament.tournament.id}/matches")

    assert response.status_code == 200
    matches = response.json()
    assert [match["status"] for match in matches] == ["finished", "live", "scheduled"]
    assert [match["score"] for match in matches] == [
        {"home": 2, "away": 1},
        {"home": 1, "away": 0},
        None,
    ]
    assert matches[0]["home_team"]["name"] == "Альфа"
    assert matches[0]["away_team"]["name"] == "Бета"


def test_scorers_without_own_goals(
    client: TestClient, sample_tournament: SampleTournament
):
    response = client.get(f"/api/tournaments/{sample_tournament.tournament.id}/scorers")

    assert response.status_code == 200
    scorers = response.json()
    # У Зайцева два гола и автогол: автогол в его голы не идёт.
    assert [(row["player"]["full_name"], row["goals"]) for row in scorers] == [
        ("Павел Зайцев", 2),
        ("Никита Орлов", 1),
    ]
    assert scorers[0]["team"]["name"] == "Бета"


def test_assists(client: TestClient, sample_tournament: SampleTournament):
    response = client.get(f"/api/tournaments/{sample_tournament.tournament.id}/assists")

    assert response.status_code == 200
    assert response.json() == [
        {
            "player": {
                "id": sample_tournament.players["Артём Белов"].id,
                "full_name": "Артём Белов",
                "number": 8,
                "position": None,
            },
            "team": {
                "id": sample_tournament.teams["Альфа"].id,
                "name": "Альфа",
                "logo_url": None,
            },
            "assists": 1,
        }
    ]


def test_load_player_stats(sample_tournament: SampleTournament):
    player_id = sample_tournament.players["Артём Белов"].id

    async def load() -> PlayerStats:
        async with session_maker() as db:
            return await load_player_stats(db=db, player_id=player_id)

    assert asyncio.run(load()) == PlayerStats(assists=1, yellow_cards=1)
