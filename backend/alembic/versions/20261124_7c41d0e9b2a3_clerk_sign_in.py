"""clerk sign-in

Revision ID: 7c41d0e9b2a3
Revises: 2a668592af69
Create Date: 2026-11-24 16:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7c41d0e9b2a3'
down_revision: Union[str, None] = '2a668592af69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('clerk_user_id', sa.String(length=255), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_clerk_user_id'), ['clerk_user_id'], unique=True)


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_clerk_user_id'))
        batch_op.drop_column('clerk_user_id')
