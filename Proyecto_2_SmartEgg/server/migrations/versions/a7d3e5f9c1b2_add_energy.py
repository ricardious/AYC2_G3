"""Store the electric consumption configuration and the estimated power."""

import sqlalchemy as sa
from alembic import op

revision = "a7d3e5f9c1b2"
down_revision = "f2c4a8e1b9d3"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "energy_configs",
        sa.Column(
            "incubator_id",
            sa.Integer(),
            sa.ForeignKey("incubators.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("heater_w", sa.Float(), nullable=False),
        sa.Column("fan_w", sa.Float(), nullable=False),
        sa.Column("relay_w", sa.Float(), nullable=False),
        sa.Column("buzzer_w", sa.Float(), nullable=False),
        sa.Column("base_w", sa.Float(), nullable=False),
        sa.Column("tariff_q_per_kwh", sa.Float(), nullable=False),
        sa.Column("tariff_label", sa.String(length=80), nullable=False),
        sa.Column("daily_limit_wh", sa.Float(), nullable=False),
        sa.Column("limit_action", sa.String(length=20), nullable=False),
        sa.Column("anomaly_avg_w", sa.Float(), nullable=False),
        sa.Column("schedules", sa.JSON(), nullable=False),
        sa.Column("timer_device", sa.String(length=20), nullable=True),
        sa.Column("timer_state", sa.Boolean(), nullable=True),
        sa.Column("timer_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "limit_action IN ('alert', 'heater_off')", name="ck_energy_limit_action"
        ),
        sa.CheckConstraint("daily_limit_wh > 0", name="ck_energy_daily_limit"),
        sa.CheckConstraint("tariff_q_per_kwh >= 0", name="ck_energy_tariff"),
    )
    op.create_table(
        "energy_samples",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "incubator_id",
            sa.Integer(),
            sa.ForeignKey("incubators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("power_w", sa.Float(), nullable=False),
        sa.Column("heater_w", sa.Float(), nullable=False),
        sa.Column("fan_w", sa.Float(), nullable=False),
        sa.Column("other_w", sa.Float(), nullable=False),
        sa.Column("energy_wh", sa.Float(), nullable=False),
        sa.Column("energy_today_wh", sa.Float(), nullable=False),
        sa.Column("cost_today_q", sa.Float(), nullable=False),
        sa.Column("anomaly_rule", sa.String(length=40), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_energy_samples_incubator_id", "energy_samples", ["incubator_id"])
    op.create_index("ix_energy_samples_recorded_at", "energy_samples", ["recorded_at"])
    op.create_index(
        "ix_energy_incubator_recorded", "energy_samples", ["incubator_id", "recorded_at"]
    )


def downgrade():
    op.drop_index("ix_energy_incubator_recorded", table_name="energy_samples")
    op.drop_index("ix_energy_samples_recorded_at", table_name="energy_samples")
    op.drop_index("ix_energy_samples_incubator_id", table_name="energy_samples")
    op.drop_table("energy_samples")
    op.drop_table("energy_configs")
