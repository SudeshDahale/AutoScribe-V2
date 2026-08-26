import base64
import hashlib
import hmac
from datetime import datetime, timezone

import httpx

GITHUB_API = "https://api.github.com"


def _humanize(iso_ts: str | None) -> str:
    if not iso_ts:
        return "unknown"
    dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    seconds = (datetime.now(timezone.utc) - dt).total_seconds()
    if seconds < 3600:
        return f"{max(1, int(seconds // 60))} min ago"
    if seconds < 86400:
        return f"{int(seconds // 3600)} hr ago"
    days = int(seconds // 86400)
    return "yesterday" if days == 1 else f"{days} days ago"


async def get_commit_detail(token: str, org: str, name: str, sha: str) -> dict:
    """Full commit detail including the 'files' array (filename/status/patch) --
    the same shape poller.py already fetches for the same purpose. Used by the
    webhook handler so push events get the same signal detection as polled commits."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{org}/{name}/commits/{sha}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "AutoScribe-Engine",
            },
        )
        if resp.status_code != 200:
            return {}
        return resp.json()


async def list_user_repos(token: str) -> list[dict]:
    repos: list[dict] = []
    page = 1
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"{GITHUB_API}/user/repos",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
                params={"per_page": 100, "page": page, "sort": "updated"},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < 100 or resp.headers.get("X-RateLimit-Remaining") == "0":
                break
            page += 1

    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "org": r["owner"]["login"],
            "private": r["private"],
            "language": r.get("language") or "Unknown",
            "branch": r.get("default_branch") or "main",
            "updated": _humanize(r.get("pushed_at")),
            "stars": r.get("stargazers_count", 0),
            "description": r.get("description") or "",
        }
        for r in repos
    ]


def get_repo_tree_sync(token: str, org: str, name: str, branch: str) -> list[dict]:
    with httpx.Client() as client:
        resp = client.get(
            f"{GITHUB_API}/repos/{org}/{name}/git/trees/{branch}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            params={"recursive": "1"},
        )
        resp.raise_for_status()
        return resp.json().get("tree", [])


def get_file_content_sync(
    token: str,
    org: str,
    name: str,
    path: str,
    branch: str,
    client: httpx.Client | None = None,
) -> str | None:
    """Fetches a single file's raw text content via the Contents API. Returns
    None for files that are binary or that fail to fetch -- callers should
    skip those rather than crash the whole chunking pass.

    Accepts an optional shared `client` so callers fetching many files (see
    services/rag.py) reuse one TCP/TLS connection instead of paying a fresh
    handshake per file -- that repeated handshake cost, multiplied across
    dozens of files, was the main reason indexing felt slow."""
    owns_client = client is None
    client = client or httpx.Client(timeout=10.0)
    try:
        resp = client.get(
            f"{GITHUB_API}/repos/{org}/{name}/contents/{path}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            params={"ref": branch},
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("encoding") != "base64" or "content" not in data:
            return None
        try:
            return base64.b64decode(data["content"]).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return None  # binary file -- not something we can chunk as text
    except httpx.HTTPError:
        return None  # network hiccup on one file shouldn't abort the batch
    finally:
        if owns_client:
            client.close()

def verify_webhook_signature(secret: str, payload: bytes, signature_header: str | None) -> bool:
    """Anyone can POST to a public webhook URL claiming to be GitHub -- this HMAC
    check, using a secret only we and GitHub know, is the only proof a request
    actually came from GitHub. Never skip it, even in dev."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def get_branch_head_sync(token: str, org: str, name: str, branch: str) -> str | None:
    """Returns the commit SHA a branch currently points to, or None if the branch
    doesn't exist yet (e.g. our doc branch hasn't been created on this repo)."""
    with httpx.Client() as client:
        resp = client.get(
            f"{GITHUB_API}/repos/{org}/{name}/git/ref/heads/{branch}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()["object"]["sha"]


def get_commit_tree_sha_sync(token: str, org: str, name: str, commit_sha: str) -> str:
    """The tree SHA a commit points to -- used as `base_tree` so a write-back
    only touches the files we actually changed, not the whole repo."""
    with httpx.Client() as client:
        resp = client.get(
            f"{GITHUB_API}/repos/{org}/{name}/git/commits/{commit_sha}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        )
        resp.raise_for_status()
        return resp.json()["tree"]["sha"]


def commit_files_sync(
    token: str,
    org: str,
    name: str,
    branch: str,
    files: dict[str, str],
    message: str,
) -> str:
    """Creates a blob per file, a tree layered on top of the branch's current tree,
    a commit, and moves (or creates) the branch ref to point at it. Returns the new
    commit SHA. This is the Git Data API's low-level path -- the same one GitHub's
    own web editor uses under the hood for a single-file commit, generalized to
    handle several files atomically in one commit."""
    with httpx.Client() as client:
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

        parent_sha = get_branch_head_sync(token, org, name, branch)
        if parent_sha is None:
            # Branch doesn't exist yet -- branch it off the repo's default branch.
            repo_resp = client.get(f"{GITHUB_API}/repos/{org}/{name}", headers=headers)
            repo_resp.raise_for_status()
            default_branch = repo_resp.json()["default_branch"]
            parent_sha = get_branch_head_sync(token, org, name, default_branch)

        base_tree_sha = get_commit_tree_sha_sync(token, org, name, parent_sha)

        blobs = []
        for path, content in files.items():
            blob_resp = client.post(
                f"{GITHUB_API}/repos/{org}/{name}/git/blobs",
                headers=headers,
                json={"content": content, "encoding": "utf-8"},
            )
            blob_resp.raise_for_status()
            blobs.append({"path": path, "mode": "100644", "type": "blob", "sha": blob_resp.json()["sha"]})

        tree_resp = client.post(
            f"{GITHUB_API}/repos/{org}/{name}/git/trees",
            headers=headers,
            json={"base_tree": base_tree_sha, "tree": blobs},
        )
        tree_resp.raise_for_status()
        tree_sha = tree_resp.json()["sha"]

        commit_resp = client.post(
            f"{GITHUB_API}/repos/{org}/{name}/git/commits",
            headers=headers,
            json={"message": message, "tree": tree_sha, "parents": [parent_sha]},
        )
        commit_resp.raise_for_status()
        commit_sha = commit_resp.json()["sha"]

        # Try moving an existing ref first; only create a new one if the branch
        # doesn't exist yet.
        update_resp = client.patch(
            f"{GITHUB_API}/repos/{org}/{name}/git/refs/heads/{branch}",
            headers=headers,
            json={"sha": commit_sha, "force": True},
        )
        if update_resp.status_code == 422 or update_resp.status_code == 404:
            create_resp = client.post(
                f"{GITHUB_API}/repos/{org}/{name}/git/refs",
                headers=headers,
                json={"ref": f"refs/heads/{branch}", "sha": commit_sha},
            )
            create_resp.raise_for_status()
        else:
            update_resp.raise_for_status()

        return commit_sha


def find_open_pull_request_sync(token: str, org: str, name: str, head_branch: str) -> dict | None:
    """Looks for an open PR already coming from our doc branch, so re-syncing
    docs pushes new commits onto the same PR instead of opening duplicates."""
    with httpx.Client() as client:
        resp = client.get(
            f"{GITHUB_API}/repos/{org}/{name}/pulls",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            params={"state": "open", "head": f"{org}:{head_branch}"},
        )
        resp.raise_for_status()
        results = resp.json()
        return results[0] if results else None


def create_pull_request_sync(
    token: str,
    org: str,
    name: str,
    title: str,
    head_branch: str,
    base_branch: str,
    body: str,
) -> dict:
    with httpx.Client() as client:
        resp = client.post(
            f"{GITHUB_API}/repos/{org}/{name}/pulls",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            json={"title": title, "head": head_branch, "base": base_branch, "body": body},
        )
        resp.raise_for_status()
        return resp.json()