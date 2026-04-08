"""create projects, furniture_types, configurations

Revision ID: 002
Revises: 001
Create Date: 2026-04-08

"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("room_schema", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "furniture_types",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("schema", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_furniture_types_category", "furniture_types", ["category"])

    op.create_table(
        "configurations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("furniture_type_id", sa.Uuid(), sa.ForeignKey("furniture_types.id"), nullable=False),
        sa.Column("applied_config", sa.JSON(), nullable=False),
        sa.Column("placement", sa.JSON(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('draft','confirmed','in_production','completed')",
            name="ck_configurations_status",
        ),
    )


def downgrade() -> None:
    op.drop_table("configurations")
    op.drop_index("ix_furniture_types_category", table_name="furniture_types")
    op.drop_table("furniture_types")
    op.drop_table("projects")
