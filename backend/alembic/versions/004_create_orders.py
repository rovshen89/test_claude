"""create orders

Revision ID: 004
Revises: 003
Create Date: 2026-04-10

"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "configuration_id",
            sa.Uuid(),
            sa.ForeignKey("configurations.id"),
            nullable=False,
        ),
        sa.Column("pricing_snapshot", sa.JSON(), nullable=False),
        sa.Column("bom_snapshot", sa.JSON(), nullable=False),
        sa.Column("export_urls", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("crm_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("configuration_id", name="uq_orders_configuration_id"),
    )


def downgrade() -> None:
    op.drop_table("orders")
