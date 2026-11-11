from datetime import date

from app.services.tournament_status import TournamentStatus, tournament_status

START = date(2026, 11, 10)
END = date(2026, 12, 15)


def test_before_start_is_upcoming():
    status = tournament_status(start_date=START, end_date=END, today=date(2026, 11, 9))

    assert status == TournamentStatus.UPCOMING


def test_first_and_last_day_are_ongoing():
    assert tournament_status(start_date=START, end_date=END, today=START) == "ongoing"
    assert tournament_status(start_date=START, end_date=END, today=END) == "ongoing"


def test_after_end_is_finished():
    status = tournament_status(start_date=START, end_date=END, today=date(2026, 12, 16))

    assert status == TournamentStatus.FINISHED
