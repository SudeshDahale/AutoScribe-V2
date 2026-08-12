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