"""Unify numbered operator roles into a single operator role."""

from alembic import op

revision = "d5f8a1c7e204"
down_revision = "c4a7d9e2f610"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("technicians") as batch_op:
        batch_op.drop_constraint("ck_technician_role", type_="check")

    op.execute(
        "UPDATE technicians SET role = 'operator' "
        "WHERE role IN ('operator_1', 'operator_2')"
    )

    with op.batch_alter_table("technicians") as batch_op:
        batch_op.create_check_constraint(
            "ck_technician_role", "role IN ('operator', 'admin')"
        )


def downgrade():
    with op.batch_alter_table("technicians") as batch_op:
        batch_op.drop_constraint("ck_technician_role", type_="check")

    op.execute("UPDATE technicians SET role = 'operator_1' WHERE role = 'operator'")

    with op.batch_alter_table("technicians") as batch_op:
        batch_op.create_check_constraint(
            "ck_technician_role",
            "role IN ('operator_1', 'operator_2', 'admin')",
        )
