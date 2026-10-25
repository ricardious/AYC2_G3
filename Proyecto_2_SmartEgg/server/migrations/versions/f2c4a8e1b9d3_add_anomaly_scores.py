"""Store the scores published by the anomaly detection service."""

import sqlalchemy as sa
from alembic import op

revision = "f2c4a8e1b9d3"
down_revision = "e7b3c9d2a415"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "anomaly_scores",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "incubator_id",
            sa.Integer(),
            sa.ForeignKey("incubators.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("anomalous", sa.Boolean(), nullable=False),
        sa.Column("alert", sa.Boolean(), nullable=False),
        sa.Column("cause", sa.String(length=80), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_anomaly_scores_incubator_id", "anomaly_scores", ["incubator_id"])
    op.create_index("ix_anomaly_scores_recorded_at", "anomaly_scores", ["recorded_at"])
    op.create_index(
        "ix_anomaly_incubator_recorded", "anomaly_scores", ["incubator_id", "recorded_at"]
    )


def downgrade():
    op.drop_index("ix_anomaly_incubator_recorded", table_name="anomaly_scores")
    op.drop_index("ix_anomaly_scores_recorded_at", table_name="anomaly_scores")
    op.drop_index("ix_anomaly_scores_incubator_id", table_name="anomaly_scores")
    op.drop_table("anomaly_scores")
