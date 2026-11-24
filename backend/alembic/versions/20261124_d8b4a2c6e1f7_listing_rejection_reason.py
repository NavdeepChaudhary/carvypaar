"""listing rejection reason

Revision ID: d8b4a2c6e1f7
Revises: c5a1e7d3f902
Create Date: 2026-11-24 22:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd8b4a2c6e1f7'
down_revision: Union[str, None] = 'c5a1e7d3f902'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('listings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rejection_reason', sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('listings', schema=None) as batch_op:
        batch_op.drop_column('rejection_reason')
