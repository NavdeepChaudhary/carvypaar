"""remove clerk sign-in

Clerk sign-in was rolled back; drop the column it added.

Revision ID: 9e2f6b1c4d8a
Revises: 7c41d0e9b2a3
Create Date: 2026-11-24 20:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9e2f6b1c4d8a'
down_revision: Union[str, None] = '7c41d0e9b2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_clerk_user_id'))
        batch_op.drop_column('clerk_user_id')


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('clerk_user_id', sa.String(length=255), nullable=True))
        batch_op.create_index(batch_op.f('ix_users_clerk_user_id'), ['clerk_user_id'], unique=True)
