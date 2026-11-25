"""count listing views once per device

Revision ID: 3f9c2b7e1a40
Revises: d8b4a2c6e1f7
Create Date: 2026-11-25 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3f9c2b7e1a40'
down_revision: Union[str, None] = 'd8b4a2c6e1f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'listing_views',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('listing_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['listing_id'], ['listings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('listing_id', 'device_id', name='uq_listing_views_listing_device'),
    )
    with op.batch_alter_table('listing_views', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_listing_views_listing_id'), ['listing_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('listing_views', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_listing_views_listing_id'))
    op.drop_table('listing_views')
