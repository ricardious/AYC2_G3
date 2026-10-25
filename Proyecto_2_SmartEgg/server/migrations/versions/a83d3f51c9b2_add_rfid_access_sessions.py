"""add RFID access sessions

Revision ID: a83d3f51c9b2
Revises: 52cf4a6c0a3c
Create Date: 2026-09-07 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a83d3f51c9b2"
down_revision: str | Sequence[str] | None = "52cf4a6c0a3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("technicians", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "role",
                sa.String(length=20),
                server_default="operator_1",
                nullable=False,
            )
        )
        batch_op.add_column(sa.Column("rfid_uid", sa.String(length=20), nullable=True))
        batch_op.create_check_constraint(
            "ck_technician_role",
            "role IN ('operator_1', 'operator_2', 'admin')",
        )
        batch_op.create_index("ix_technicians_role", ["role"], unique=False)
        batch_op.create_index("ix_technicians_rfid_uid", ["rfid_uid"], unique=True)

    op.create_table(
        "access_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token_id", sa.String(length=64), nullable=False),
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("incubator_id", sa.Integer(), nullable=False),
        sa.Column("method", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_reason", sa.String(length=20), nullable=True),
        sa.Column("door_opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("door_closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "method IN ('rfid', 'fingerprint', 'key', 'password')",
            name="ck_access_session_method",
        ),
        sa.CheckConstraint(
            "ended_reason IS NULL OR ended_reason IN "
            "('door_closed', 'expired', 'logout', 'replaced', 'unlock_timeout')",
            name="ck_access_session_ended_reason",
        ),
        sa.CheckConstraint(
            "door_closed_at IS NULL OR door_opened_at IS NOT NULL",
            name="ck_access_session_door_order",
        ),
        sa.CheckConstraint(
            "door_closed_at IS NULL OR door_closed_at >= door_opened_at",
            name="ck_access_session_door_chronology",
        ),
        sa.ForeignKeyConstraint(
            ["incubator_id"], ["incubators.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["technician_id"], ["technicians.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("access_sessions", schema=None) as batch_op:
        batch_op.create_index(
            "ix_access_session_incubator_started",
            ["incubator_id", "started_at"],
            unique=False,
        )
        batch_op.create_index(
            "ix_access_sessions_incubator_id", ["incubator_id"], unique=False
        )
        batch_op.create_index(
            "ix_access_sessions_technician_id", ["technician_id"], unique=False
        )
        batch_op.create_index("ix_access_sessions_token_id", ["token_id"], unique=True)

    with op.batch_alter_table("door_events", schema=None) as batch_op:
        batch_op.add_column(sa.Column("access_session_id", sa.Integer(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "access_method",
                sa.String(length=20),
                server_default="password",
                nullable=False,
            )
        )
        batch_op.create_check_constraint(
            "ck_door_event_access_method",
            "access_method IN ('rfid', 'fingerprint', 'key', 'password')",
        )
        batch_op.create_foreign_key(
            "fk_door_events_access_session_id",
            "access_sessions",
            ["access_session_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_door_events_access_session_id", ["access_session_id"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("door_events", schema=None) as batch_op:
        batch_op.drop_index("ix_door_events_access_session_id")
        batch_op.drop_constraint("ck_door_event_access_method", type_="check")
        batch_op.drop_constraint("fk_door_events_access_session_id", type_="foreignkey")
        batch_op.drop_column("access_method")
        batch_op.drop_column("access_session_id")

    with op.batch_alter_table("access_sessions", schema=None) as batch_op:
        batch_op.drop_index("ix_access_sessions_token_id")
        batch_op.drop_index("ix_access_sessions_technician_id")
        batch_op.drop_index("ix_access_sessions_incubator_id")
        batch_op.drop_index("ix_access_session_incubator_started")
    op.drop_table("access_sessions")

    with op.batch_alter_table("technicians", schema=None) as batch_op:
        batch_op.drop_index("ix_technicians_rfid_uid")
        batch_op.drop_index("ix_technicians_role")
        batch_op.drop_constraint("ck_technician_role", type_="check")
        batch_op.drop_column("rfid_uid")
        batch_op.drop_column("role")
