"""add last_dispatch to orders

Revision ID: 005
Revises: 004
Create Date: 2026-04-11

"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # sa.JSON() is used consistently with all other JSON columns in this project
    # (pricing_snapshot, bom_snapshot, export_urls, crm_config).
    # Upgrade to JSONB if PostgreSQL-specific operators or indexing are needed.
    op.add_column("orders", sa.Column("last_dispatch", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "last_dispatch")
