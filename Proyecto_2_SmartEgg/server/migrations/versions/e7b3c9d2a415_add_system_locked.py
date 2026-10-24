"""Store the object-detection lock reported by the firmware."""

import sqlalchemy as sa
from alembic import op

revision = "e7b3c9d2a415"
down_revision = "d5f8a1c7e204"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "telemetry_readings", sa.Column("system_locked", sa.Boolean(), nullable=True)
    )


def downgrade():
    op.drop_column("telemetry_readings", "system_locked")
