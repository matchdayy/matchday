from datetime import UTC, datetime, timedelta

from app.models import Match, MatchStatus, MatchStatusChange
from app.services.match_clock import MatchClock, match_clock, record_status_change

KICKOFF = datetime(2026, 11, 12, 18, 30, tzinfo=UTC)


def at(minutes: float) -> datetime:
    """Момент через столько-то минут после начала матча."""
    return KICKOFF + timedelta(minutes=minutes)


def journal(*steps: tuple[MatchStatus, float]) -> list[MatchStatusChange]:
    """Журнал смены статусов: (статус, минута от начала матча)."""
    return [
        MatchStatusChange(status=status, changed_at=at(minutes))
        for status, minutes in steps
    ]


def test_scheduled_match_has_no_clock():
    assert match_clock(status=MatchStatus.SCHEDULED, changes=[], now=at(0)) is None


def test_cancelled_match_has_no_clock():
    changes = journal((MatchStatus.LIVE, 0), (MatchStatus.CANCELLED, 10))

    assert (
        match_clock(status=MatchStatus.CANCELLED, changes=changes, now=at(30)) is None
    )


def test_first_seconds_are_first_minute():
    changes = journal((MatchStatus.LIVE, 0))

    clock = match_clock(status=MatchStatus.LIVE, changes=changes, now=at(0.5))

    assert clock == MatchClock(elapsed_seconds=30, running=True, minute=1)


def test_live_match_counts_until_now():
    changes = journal((MatchStatus.LIVE, 0))

    clock = match_clock(status=MatchStatus.LIVE, changes=changes, now=at(37.5))

    assert clock == MatchClock(elapsed_seconds=37 * 60 + 30, running=True, minute=38)


def test_pause_stops_the_clock():
    changes = journal((MatchStatus.LIVE, 0), (MatchStatus.PAUSED, 45))

    clock = match_clock(status=MatchStatus.PAUSED, changes=changes, now=at(55))

    assert clock == MatchClock(elapsed_seconds=45 * 60, running=False, minute=46)


def test_several_pauses_are_not_counted():
    changes = journal(
        (MatchStatus.LIVE, 0),
        (MatchStatus.PAUSED, 20),
        (MatchStatus.LIVE, 25),  # 5 минут паузы
        (MatchStatus.PAUSED, 45),
        (MatchStatus.LIVE, 60),  # перерыв 15 минут
    )

    clock = match_clock(status=MatchStatus.LIVE, changes=changes, now=at(70))

    # 20 + 20 + 10 минут игры.
    assert clock == MatchClock(elapsed_seconds=50 * 60, running=True, minute=51)


def test_finished_match_clock_stops():
    changes = journal(
        (MatchStatus.LIVE, 0),
        (MatchStatus.PAUSED, 45),
        (MatchStatus.LIVE, 60),
        (MatchStatus.FINISHED, 105),
    )

    clock = match_clock(status=MatchStatus.FINISHED, changes=changes, now=at(500))

    assert clock == MatchClock(elapsed_seconds=90 * 60, running=False, minute=91)


def test_minute_is_capped_at_150():
    changes = journal((MatchStatus.LIVE, 0))

    clock = match_clock(status=MatchStatus.LIVE, changes=changes, now=at(400))

    assert clock is not None
    assert clock.elapsed_seconds == 400 * 60
    assert clock.minute == 150


def test_live_without_journal_starts_from_zero():
    # Матчи, начатые до появления журнала: время неизвестно, показываем 1-ю минуту.
    clock = match_clock(status=MatchStatus.LIVE, changes=[], now=at(10))

    assert clock == MatchClock(elapsed_seconds=0, running=True, minute=1)


def test_record_status_change_updates_status_and_journal():
    match = Match(status=MatchStatus.SCHEDULED, status_changes=[])

    record_status_change(match=match, status=MatchStatus.LIVE, at=at(0))
    record_status_change(match=match, status=MatchStatus.PAUSED, at=at(45))

    assert match.status == MatchStatus.PAUSED
    assert [(change.status, change.changed_at) for change in match.status_changes] == [
        (MatchStatus.LIVE, at(0)),
        (MatchStatus.PAUSED, at(45)),
    ]


def test_record_status_change_defaults_to_now():
    match = Match(status=MatchStatus.SCHEDULED, status_changes=[])
    before = datetime.now(tz=UTC)

    change = record_status_change(match=match, status=MatchStatus.LIVE)

    assert before <= change.changed_at <= datetime.now(tz=UTC)
