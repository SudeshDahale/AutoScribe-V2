"""add cascade deletes to repository foreign keys

Revision ID: e1a2b3c4d5f6
Revises: f3a8b6c1d9e2
Create Date: 2026-08-17 00:00:00.000000

Drops and recreates every FK constraint that references repositories.id (and
the child tables documents → document_versions, chat_conversations →
chat_messages) to add ON DELETE CASCADE or ON DELETE SET NULL.  The order
matters: child constraints are dropped before parents, and recreated in
reverse order.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, None] = 'f3a8b6c1d9e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. analyses  →  repositories (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('analyses_repository_id_fkey', 'analyses', type_='foreignkey')
    op.create_foreign_key(
        'analyses_repository_id_fkey', 'analyses',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 2. modules  →  repositories (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('modules_repository_id_fkey', 'modules', type_='foreignkey')
    op.create_foreign_key(
        'modules_repository_id_fkey', 'modules',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 3. architecture_nodes & architecture_edges  →  analyses (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('architecture_nodes_analysis_id_fkey', 'architecture_nodes', type_='foreignkey')
    op.create_foreign_key(
        'architecture_nodes_analysis_id_fkey', 'architecture_nodes',
        'analyses', ['analysis_id'], ['id'],
        ondelete='CASCADE',
    )
    op.drop_constraint('architecture_edges_analysis_id_fkey', 'architecture_edges', type_='foreignkey')
    op.create_foreign_key(
        'architecture_edges_analysis_id_fkey', 'architecture_edges',
        'analyses', ['analysis_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 4. documents  →  repositories (CASCADE)
    #    document_versions  →  documents (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('documents_repository_id_fkey', 'documents', type_='foreignkey')
    op.create_foreign_key(
        'documents_repository_id_fkey', 'documents',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )
    op.drop_constraint('document_versions_document_id_fkey', 'document_versions', type_='foreignkey')
    op.create_foreign_key(
        'document_versions_document_id_fkey', 'document_versions',
        'documents', ['document_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 5. pull_requests  →  repositories (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('pull_requests_repository_id_fkey', 'pull_requests', type_='foreignkey')
    op.create_foreign_key(
        'pull_requests_repository_id_fkey', 'pull_requests',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 6. chat_conversations  →  repositories (CASCADE)
    #    chat_messages  →  chat_conversations (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('chat_conversations_repository_id_fkey', 'chat_conversations', type_='foreignkey')
    op.create_foreign_key(
        'chat_conversations_repository_id_fkey', 'chat_conversations',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )
    op.drop_constraint('chat_messages_conversation_id_fkey', 'chat_messages', type_='foreignkey')
    op.create_foreign_key(
        'chat_messages_conversation_id_fkey', 'chat_messages',
        'chat_conversations', ['conversation_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 7. activity_log  →  repositories (SET NULL — log entries survive)
    # ------------------------------------------------------------------
    op.drop_constraint('activity_log_repository_id_fkey', 'activity_log', type_='foreignkey')
    op.create_foreign_key(
        'activity_log_repository_id_fkey', 'activity_log',
        'repositories', ['repository_id'], ['id'],
        ondelete='SET NULL',
    )

    # ------------------------------------------------------------------
    # 8. chunk_embeddings  →  repositories (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('chunk_embeddings_repository_id_fkey', 'chunk_embeddings', type_='foreignkey')
    op.create_foreign_key(
        'chunk_embeddings_repository_id_fkey', 'chunk_embeddings',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 9. repo_settings  →  repositories (CASCADE)
    # ------------------------------------------------------------------
    op.drop_constraint('repo_settings_repository_id_fkey', 'repo_settings', type_='foreignkey')
    op.create_foreign_key(
        'repo_settings_repository_id_fkey', 'repo_settings',
        'repositories', ['repository_id'], ['id'],
        ondelete='CASCADE',
    )

    # ------------------------------------------------------------------
    # 10. token_usage  →  repositories (SET NULL — token history survives)
    # ------------------------------------------------------------------
    op.drop_constraint('token_usage_repository_id_fkey', 'token_usage', type_='foreignkey')
    op.create_foreign_key(
        'token_usage_repository_id_fkey', 'token_usage',
        'repositories', ['repository_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    # Restore all constraints without ondelete rules.
    for table, col, ref_table, ref_col in [
        ('analyses', 'repository_id', 'repositories', 'id'),
        ('modules', 'repository_id', 'repositories', 'id'),
        ('architecture_nodes', 'analysis_id', 'analyses', 'id'),
        ('architecture_edges', 'analysis_id', 'analyses', 'id'),
        ('documents', 'repository_id', 'repositories', 'id'),
        ('document_versions', 'document_id', 'documents', 'id'),
        ('pull_requests', 'repository_id', 'repositories', 'id'),
        ('chat_conversations', 'repository_id', 'repositories', 'id'),
        ('chat_messages', 'conversation_id', 'chat_conversations', 'id'),
        ('activity_log', 'repository_id', 'repositories', 'id'),
        ('chunk_embeddings', 'repository_id', 'repositories', 'id'),
        ('repo_settings', 'repository_id', 'repositories', 'id'),
        ('token_usage', 'repository_id', 'repositories', 'id'),
    ]:
        constraint_name = f'{table}_{col}_fkey'
        op.drop_constraint(constraint_name, table, type_='foreignkey')
        op.create_foreign_key(constraint_name, table, ref_table, [col], [ref_col])
