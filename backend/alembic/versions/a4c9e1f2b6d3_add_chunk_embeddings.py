"""add chunk_embeddings table

Revision ID: a4c9e1f2b6d3
Revises: 120e7dd6d3fc
Create Date: 2026-08-15 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c9e1f2b6d3'
down_revision: Union[str, None] = '120e7dd6d3fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chunk_embeddings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('repository_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.Column('chunk_text', sa.Text(), nullable=False),
        sa.Column('embedding', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['repository_id'], ['repositories.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chunk_embeddings_repository_id', 'chunk_embeddings', ['repository_id'])


def downgrade() -> None:
    op.drop_index('ix_chunk_embeddings_repository_id', table_name='chunk_embeddings')
    op.drop_table('chunk_embeddings')