"""Naive chunking: splits file content into overlapping windows of whole
lines. This is intentionally simple -- it doesn't know about function or
class boundaries, so it will sometimes split a function in half. That's
the tradeoff flagged in the sprint notes: fixed-size chunking is easy to
reason about but hurts retrieval quality compared to AST-aware chunking,
which is a good follow-up once the basic flow works end to end."""

CHUNK_CHAR_TARGET = 1200
CHUNK_OVERLAP_LINES = 3


def chunk_text(file_path: str, content: str) -> list[dict]:
    lines = content.splitlines()
    if not lines:
        return []

    chunks: list[dict] = []
    current: list[str] = []
    current_len = 0

    for line in lines:
        current.append(line)
        current_len += len(line) + 1
        if current_len >= CHUNK_CHAR_TARGET:
            chunks.append({
                "file_path": file_path,
                "chunk_index": len(chunks),
                "text": "\n".join(current),
            })
            # Start the next chunk with a small overlap so context isn't
            # lost right at the boundary between two chunks.
            overlap = current[-CHUNK_OVERLAP_LINES:]
            current = list(overlap)
            current_len = sum(len(l) + 1 for l in current)

    if current:
        chunks.append({
            "file_path": file_path,
            "chunk_index": len(chunks),
            "text": "\n".join(current),
        })

    return chunks


def chunk_files(files: dict[str, str]) -> list[dict]:
    all_chunks: list[dict] = []
    for path, content in files.items():
        all_chunks.extend(chunk_text(path, content))
    return all_chunks