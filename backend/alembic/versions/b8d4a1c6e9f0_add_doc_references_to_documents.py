"""add doc_references to documents

Revision ID: b8d4a1c6e9f0
Revises: a7c2f4e8b1d3
Create Date: 2026-08-26 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8d4a1c6e9f0'
down_revision: Union[str, None] = 'a7c2f4e8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('documents', sa.Column('doc_references', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('documents', 'doc_references')
