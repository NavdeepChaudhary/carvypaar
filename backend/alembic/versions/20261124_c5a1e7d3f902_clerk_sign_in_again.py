"""clerk sign-in (re-added)

Clerk sign-in is back after a rollback (9e2f6b1c4d8a dropped the column).

Revision ID: c5a1e7d3f902
Revises: 9e2f6b1c4d8a
Create Date: 2026-11-24 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5a1e7d3f902'
down_revision: Union[str, None] = '9e2f6b1c4d8a'
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
