"""Expose firmware power and DHT health on telemetry."""

import sqlalchemy as sa
from alembic import op

revision = "b92d6e8f104a"
down_revision = "a83d3f51c9b2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "telemetry_readings", sa.Column("system_enabled", sa.Boolean(), nullable=True)
    )
    op.add_column(
        "telemetry_readings", sa.Column("sensor_ok", sa.Boolean(), nullable=True)
    )


def downgrade():
    op.drop_column("telemetry_readings", "sensor_ok")
    op.drop_column("telemetry_readings", "system_enabled")
