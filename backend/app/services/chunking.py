"""Safe chunking with hard character limits.

Splits file content into overlapping windows of whole lines, but enforces a
hard max character limit per chunk so that no single chunk can exceed the
embedding model's input token limit (typically 8192 tokens ≈ ~6000 chars).

Long single lines (e.g. minified JS) are split at character boundaries when
they exceed the hard max."""

CHUNK_CHAR_TARGET = 1200
CHUNK_CHAR_HARD_MAX = 2000
CHUNK_OVERLAP_LINES = 3

# Files that should never be chunked — they're generated, not source code,
# and their contents blow up embedding token limits.
SKIP_FILENAMES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock",
    "Gemfile.lock", "poetry.lock", "composer.lock", "go.sum",
}
SKIP_EXTENSIONS = {".min.js", ".min.css", ".map", ".wasm"}


def _should_skip(path: str) -> bool:
    basename = path.rsplit("/", 1)[-1] if "/" in path else path
    if basename in SKIP_FILENAMES:
        return True
    return any(path.endswith(ext) for ext in SKIP_EXTENSIONS)


def _split_long_line(line: str, max_chars: int) -> list[str]:
    """Break a single very-long line into multiple pieces so each fits
    within the hard max. This handles minified JS/CSS gracefully."""
    if len(line) <= max_chars:
        return [line]
    pieces = []
    for i in range(0, len(line), max_chars):
        pieces.append(line[i : i + max_chars])
    return pieces


def chunk_text(file_path: str, content: str) -> list[dict]:
    if _should_skip(file_path):
        return []

    raw_lines = content.splitlines()
    if not raw_lines:
        return []

    # Pre-split any lines that are individually longer than the hard max
    lines: list[str] = []
    for line in raw_lines:
        lines.extend(_split_long_line(line, CHUNK_CHAR_HARD_MAX))

    chunks: list[dict] = []
    current: list[str] = []
    current_len = 0

    for line in lines:
        current.append(line)
        current_len += len(line) + 1

        if current_len >= CHUNK_CHAR_TARGET:
            text = "\n".join(current)
            # Hard clamp — should rarely trigger now that lines are pre-split
            if len(text) > CHUNK_CHAR_HARD_MAX:
                text = text[:CHUNK_CHAR_HARD_MAX]
            chunks.append({
                "file_path": file_path,
                "chunk_index": len(chunks),
                "text": text,
            })
            # Start the next chunk with a small overlap so context isn't
            # lost right at the boundary between two chunks.
            overlap = current[-CHUNK_OVERLAP_LINES:]
            current = list(overlap)
            current_len = sum(len(l) + 1 for l in current)

    if current:
        text = "\n".join(current)
        if len(text) > CHUNK_CHAR_HARD_MAX:
            text = text[:CHUNK_CHAR_HARD_MAX]
        chunks.append({
            "file_path": file_path,
            "chunk_index": len(chunks),
            "text": text,
        })

    return chunks


def chunk_files(files: dict[str, str]) -> list[dict]:
    all_chunks: list[dict] = []
    for path, content in files.items():
        all_chunks.extend(chunk_text(path, content))
    return all_chunks