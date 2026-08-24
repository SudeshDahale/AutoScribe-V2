import asyncio
from datetime import datetime, timedelta, timezone
from typing import Literal

# Engine operational modes
EngineMode = Literal["active", "paused", "manual"]

class QuotaManager:
    """Tracks LLM API rate limits, daily quotas, and manages auto-pause / auto-resume
    for free tier providers (Groq, Gemini, Ollama, OpenAI)."""

    def __init__(self):
        self._mode: EngineMode = "active"
        self._cooldown_until: datetime | None = None
        self._pause_reason: str | None = None
        self._last_checked: datetime = datetime.now(timezone.utc)
        self._daily_limit: int = 250_000

    @property
    def mode(self) -> EngineMode:
        # Check if cooldown has expired
        if self._mode == "paused" and self._cooldown_until:
            if datetime.now(timezone.utc) >= self._cooldown_until:
                self._mode = "active"
                self._cooldown_until = None
                self._pause_reason = None
        return self._mode

    def set_mode(self, mode: EngineMode, reason: str | None = None):
        self._mode = mode
        if mode != "paused":
            self._cooldown_until = None
            self._pause_reason = None
        elif reason:
            self._pause_reason = reason

    def record_rate_limit(self, retry_after_seconds: int = 3600, reason: str = "Rate limit / quota reached"):
        """Called when an API returns 429 Too Many Requests or quota error.
        Puts the autonomous engine into a cooldown state and schedules auto-resume."""
        now = datetime.now(timezone.utc)
        # Default to UTC midnight or at least retry_after_seconds
        midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        cooldown = max(now + timedelta(seconds=retry_after_seconds), midnight if "daily" in reason.lower() else now + timedelta(seconds=retry_after_seconds))
        self._mode = "paused"
        self._cooldown_until = cooldown
        self._pause_reason = reason

    def is_available(self) -> bool:
        return self.mode == "active"

    def get_status(self) -> dict:
        now = datetime.now(timezone.utc)
        is_paused = self.mode == "paused"
        resets_in = None
        if self._cooldown_until and is_paused:
            diff = self._cooldown_until - now
            if diff.total_seconds() > 0:
                hours, rem = divmod(int(diff.total_seconds()), 3600)
                mins = rem // 60
                resets_in = f"{hours}h {mins}m"

        return {
            "mode": self.mode,
            "isAvailable": self.is_available(),
            "isPaused": is_paused,
            "pauseReason": self._pause_reason,
            "cooldownUntil": self._cooldown_until.isoformat() if self._cooldown_until else None,
            "resetsIn": resets_in,
            "dailyLimit": self._daily_limit,
        }

quota_manager = QuotaManager()
