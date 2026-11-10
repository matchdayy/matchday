"""tournaments teams players matches events

Первая миграция: создаёт таблицы турниров, команд, игроков, матчей
и событий матча. Описание полей — в README, раздел «Какие данные есть».

Revision ID: 02d707d7e26a
Revises: 
Create Date: 2026-11-06 09:36:18.336277

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '02d707d7e26a'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('tournaments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('sport', sa.String(length=50), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('end_date >= start_date', name=op.f('ck_tournaments_dates_order')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tournaments'))
    )
    op.create_table('teams',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tournament_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('logo_url', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['tournament_id'], ['tournaments.id'], name=op.f('fk_teams_tournament_id_tournaments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_teams')),
    sa.UniqueConstraint('tournament_id', 'name', name=op.f('uq_teams_tournament_id_name'))
    )
    op.create_index(op.f('ix_teams_tournament_id'), 'teams', ['tournament_id'], unique=False)
    op.create_table('matches',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tournament_id', sa.Integer(), nullable=False),
    sa.Column('home_team_id', sa.Integer(), nullable=False),
    sa.Column('away_team_id', sa.Integer(), nullable=False),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('venue', sa.String(length=200), nullable=True),
    sa.Column('status', sa.Enum('scheduled', 'live', 'finished', 'cancelled', name='status', native_enum=False, create_constraint=True, length=20), server_default='scheduled', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('home_team_id <> away_team_id', name=op.f('ck_matches_different_teams')),
    sa.ForeignKeyConstraint(['away_team_id'], ['teams.id'], name=op.f('fk_matches_away_team_id_teams')),
    sa.ForeignKeyConstraint(['home_team_id'], ['teams.id'], name=op.f('fk_matches_home_team_id_teams')),
    sa.ForeignKeyConstraint(['tournament_id'], ['tournaments.id'], name=op.f('fk_matches_tournament_id_tournaments'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_matches'))
    )
    op.create_index(op.f('ix_matches_away_team_id'), 'matches', ['away_team_id'], unique=False)
    op.create_index(op.f('ix_matches_home_team_id'), 'matches', ['home_team_id'], unique=False)
    op.create_index(op.f('ix_matches_tournament_id'), 'matches', ['tournament_id'], unique=False)
    op.create_table('players',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('team_id', sa.Integer(), nullable=False),
    sa.Column('full_name', sa.String(length=150), nullable=False),
    sa.Column('position', sa.String(length=30), nullable=True),
    sa.Column('number', sa.SmallInteger(), nullable=True),
    sa.Column('photo_url', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('number BETWEEN 0 AND 99', name=op.f('ck_players_number_range')),
    sa.ForeignKeyConstraint(['team_id'], ['teams.id'], name=op.f('fk_players_team_id_teams'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_players')),
    sa.UniqueConstraint('team_id', 'number', name=op.f('uq_players_team_id_number'))
    )
    op.create_index(op.f('ix_players_team_id'), 'players', ['team_id'], unique=False)
    op.create_table('match_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('match_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.Enum('goal', 'yellow_card', 'red_card', name='type', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('minute', sa.SmallInteger(), nullable=False),
    sa.Column('player_id', sa.Integer(), nullable=False),
    sa.Column('assist_player_id', sa.Integer(), nullable=True),
    sa.Column('is_own_goal', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("assist_player_id IS NULL OR type = 'goal'", name=op.f('ck_match_events_assist_only_for_goal')),
    sa.CheckConstraint('assist_player_id IS NULL OR assist_player_id <> player_id', name=op.f('ck_match_events_assist_not_scorer')),
    sa.CheckConstraint('minute BETWEEN 0 AND 150', name=op.f('ck_match_events_minute_range')),
    sa.CheckConstraint("NOT is_own_goal OR (type = 'goal' AND assist_player_id IS NULL)", name=op.f('ck_match_events_own_goal_only_for_goal')),
    sa.ForeignKeyConstraint(['assist_player_id'], ['players.id'], name=op.f('fk_match_events_assist_player_id_players')),
    sa.ForeignKeyConstraint(['match_id'], ['matches.id'], name=op.f('fk_match_events_match_id_matches'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['player_id'], ['players.id'], name=op.f('fk_match_events_player_id_players')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_match_events'))
    )
    op.create_index(op.f('ix_match_events_assist_player_id'), 'match_events', ['assist_player_id'], unique=False)
    op.create_index(op.f('ix_match_events_match_id'), 'match_events', ['match_id'], unique=False)
    op.create_index(op.f('ix_match_events_player_id'), 'match_events', ['player_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_match_events_player_id'), table_name='match_events')
    op.drop_index(op.f('ix_match_events_match_id'), table_name='match_events')
    op.drop_index(op.f('ix_match_events_assist_player_id'), table_name='match_events')
    op.drop_table('match_events')
    op.drop_index(op.f('ix_players_team_id'), table_name='players')
    op.drop_table('players')
    op.drop_index(op.f('ix_matches_tournament_id'), table_name='matches')
    op.drop_index(op.f('ix_matches_home_team_id'), table_name='matches')
    op.drop_index(op.f('ix_matches_away_team_id'), table_name='matches')
    op.drop_table('matches')
    op.drop_index(op.f('ix_teams_tournament_id'), table_name='teams')
    op.drop_table('teams')
    op.drop_table('tournaments')
