"""Add operator scoping, assignments and report audit records."""

import sqlalchemy as sa
from alembic import op

revision = "c4a7d9e2f610"
down_revision = "b92d6e8f104a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "technician_incubators",
        sa.Column("technician_id", sa.Integer(), nullable=False),
        sa.Column("incubator_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["technician_id"], ["technicians.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["incubator_id"], ["incubators.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("technician_id", "incubator_id"),
    )
    op.add_column("lots", sa.Column("created_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_lots_created_by",
        "lots",
        "technicians",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_lots_created_by_id", "lots", ["created_by_id"])
    op.add_column("eggs", sa.Column("registered_by_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_eggs_registered_by",
        "eggs",
        "technicians",
        ["registered_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_eggs_registered_by_id", "eggs", ["registered_by_id"])
    op.create_table(
        "report_exports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("incubator_id", sa.Integer(), nullable=False),
        sa.Column("generated_by_id", sa.Integer(), nullable=False),
        sa.Column("subject_operator_id", sa.Integer(), nullable=True),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("report_day", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "scope IN ('personal', 'operator', 'global')",
            name="ck_report_export_scope",
        ),
        sa.ForeignKeyConstraint(
            ["incubator_id"], ["incubators.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["generated_by_id"], ["technicians.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["subject_operator_id"], ["technicians.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_report_exports_incubator_id", "report_exports", ["incubator_id"]
    )
    op.create_index(
        "ix_report_exports_generated_by_id", "report_exports", ["generated_by_id"]
    )
    op.create_index(
        "ix_report_exports_subject_operator_id",
        "report_exports",
        ["subject_operator_id"],
    )
    op.create_index("ix_report_exports_report_day", "report_exports", ["report_day"])
    op.create_index(
        "ix_report_exports_generated_at", "report_exports", ["generated_at"]
    )
    op.create_index(
        "ix_report_export_generated_by_at",
        "report_exports",
        ["generated_by_id", "generated_at"],
    )
    op.execute(
        """
        INSERT INTO technician_incubators (technician_id, incubator_id, assigned_at)
        SELECT t.id, i.id, CURRENT_TIMESTAMP
        FROM technicians AS t CROSS JOIN incubators AS i
        WHERE t.role IN ('operator_1', 'operator_2')
        """
    )


def downgrade():
    op.drop_table("report_exports")
    op.drop_index("ix_eggs_registered_by_id", table_name="eggs")
    op.drop_constraint("fk_eggs_registered_by", "eggs", type_="foreignkey")
    op.drop_column("eggs", "registered_by_id")
    op.drop_index("ix_lots_created_by_id", table_name="lots")
    op.drop_constraint("fk_lots_created_by", "lots", type_="foreignkey")
    op.drop_column("lots", "created_by_id")
    op.drop_table("technician_incubators")
