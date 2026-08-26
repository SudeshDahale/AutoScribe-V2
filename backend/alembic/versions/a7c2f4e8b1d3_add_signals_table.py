"""add signals table

Revision ID: a7c2f4e8b1d3
Revises: e1a2b3c4d5f6
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c2f4e8b1d3'
down_revision: Union[str, None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'signals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('repository_id', sa.Integer(), nullable=False),
        sa.Column('analysis_id', sa.Integer(), nullable=True),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('subtype', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('payload', sa.JSON(), nullable=True),
        sa.Column('severity', sa.String(), nullable=False, server_default='info'),
        sa.Column('doc_impact', sa.JSON(), nullable=True),
        sa.Column('source_commit_sha', sa.String(), nullable=True),
        sa.Column('relevant', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['repository_id'], ['repositories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_signals_repo_category_created',
        'signals',
        ['repository_id', 'category', 'created_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_signals_repo_category_created', table_name='signals')
    op.drop_table('signals')
