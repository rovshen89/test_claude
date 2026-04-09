"""create material_catalog

Revision ID: 003
Revises: 002
Create Date: 2026-04-09

"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "material_catalog",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("sku", sa.Text(), nullable=False),
        sa.Column("thickness_options", sa.JSON(), nullable=False),
        sa.Column("price_per_m2", sa.Numeric(10, 2), nullable=False),
        sa.Column("edgebanding_price_per_mm", sa.Numeric(10, 2), nullable=True),
        sa.Column("s3_albedo", sa.Text(), nullable=True),
        sa.Column("s3_normal", sa.Text(), nullable=True),
        sa.Column("s3_roughness", sa.Text(), nullable=True),
        sa.Column("s3_ao", sa.Text(), nullable=True),
        sa.Column("grain_direction", sa.Text(), nullable=False, server_default="none"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "grain_direction IN ('horizontal','vertical','none')",
            name="ck_material_catalog_grain_direction",
        ),
    )
    op.create_index("ix_material_catalog_category", "material_catalog", ["category"])


def downgrade() -> None:
    op.drop_index("ix_material_catalog_category", table_name="material_catalog")
    op.drop_table("material_catalog")
