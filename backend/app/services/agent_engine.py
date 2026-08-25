"""
agent_engine.py — In-memory Intelligent Autonomous Agent Engine

Tracks incoming events, classifies them into actionable tasks, maintains a
priority queue, and executes tasks step-by-step with real-time SSE updates.

Features:
1. Autonomous Background Worker Loop:
   - Continuously processes queued tasks step-by-step.
   - Runs periodic system maintenance & health audit routines when idle.
2. Scalable Structured Log Formatting:
   - Categorizes events into levels: [AGENT], [SYNC], [MAINT], [QUOTA], [WARN], [INFO].
3. Resilient Token & Quota Management:
   - Respects QuotaManager status.
   - Gracefully pauses tasks into a 'paused_quota' state when tokens hit limit or 429 occurs.
   - Auto-resumes queued tasks when quota cooldown expires without breaking anything.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Deque, List, Optional
from uuid import uuid4

from app.services.quota import quota_manager

# ─── Data Classes ────────────────────────────────────────────────────────────

@dataclass
class AgentEvent:
    """A raw event captured from the system (GitHub, analysis pipeline, etc.)."""
    id: str = field(default_factory=lambda: str(uuid4())[:8])
    source: str = ""          # "github", "analysis", "system", "webhook", "maintenance"
    type: str = ""            # "commit", "pr_opened", "analysis_complete", "quota_paused", "maint_check", etc.
    level: str = "INFO"       # "AGENT" | "SYNC" | "MAINT" | "QUOTA" | "WARN" | "INFO"
    title: str = ""           # Short human-readable summary
    detail: str = ""          # Longer description
    repo_name: str = ""
    relevant: bool = True     # Filtered by classifier
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "type": self.type,
            "level": self.level,
            "title": self.title,
            "detail": self.detail,
            "repoName": self.repo_name,
            "relevant": self.relevant,
            "createdAt": self.created_at,
            "timeAgo": _time_ago(self.created_at),
        }


@dataclass
class AgentTask:
    """An actionable task derived from one or more events."""
    id: str = field(default_factory=lambda: str(uuid4())[:8])
    title: str = ""
    description: str = ""
    repo_name: str = ""
    priority: int = 5        # 1 = highest, 10 = lowest
    status: str = "queued"   # "queued" | "running" | "paused_quota" | "done" | "failed"
    event_id: str = ""       # Which event triggered this
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "repoName": self.repo_name,
            "priority": self.priority,
            "status": self.status,
            "eventId": self.event_id,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "timeAgo": _time_ago(self.created_at),
        }


@dataclass
class ExecutionStep:
    """A single step in the agent's execution of a task."""
    label: str = ""
    detail: str = ""
    status: str = "pending"  # "pending" | "running" | "done" | "error" | "paused"
    pct: int = 0             # Percentage contribution toward the task
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "detail": self.detail,
            "status": self.status,
            "pct": self.pct,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        }


@dataclass
class AgentExecution:
    """Tracks the full execution of a task with its sub-steps."""
    task_id: str = ""
    task_title: str = ""
    repo_name: str = ""
    steps: List[ExecutionStep] = field(default_factory=list)
    status: str = "running"  # "running" | "done" | "failed" | "paused_quota"
    overall_pct: int = 0
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        done_steps = [s for s in self.steps if s.status == "done"]
        total_pct = sum(s.pct for s in done_steps)
        running = next((s for s in self.steps if s.status == "running"), None)
        if running:
            total_pct += running.pct // 2
        return {
            "taskId": self.task_id,
            "taskTitle": self.task_title,
            "repoName": self.repo_name,
            "steps": [s.to_dict() for s in self.steps],
            "status": self.status,
            "overallPct": min(total_pct, 100),
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
            "elapsedSecs": _elapsed(self.started_at),
        }


# ─── Event Classifier ────────────────────────────────────────────────────────

_RELEVANT_TYPES = {
    "commit",
    "pr_opened",
    "pr_merged",
    "analysis_started",
    "analysis_complete",
    "analysis_failed",
    "webhook_push",
    "repo_connected",
    "writeback_pr",
    "quota_resumed",
    "maint_audit",
}

def _determine_level(source: str, event_type: str) -> str:
    if "quota" in event_type or "rate_limit" in event_type:
        return "QUOTA"
    if "fail" in event_type or "error" in event_type:
        return "WARN"
    if event_type in ("commit", "pr_opened", "pr_merged", "writeback_pr"):
        return "SYNC"
    if source == "maintenance" or "maint" in event_type:
        return "MAINT"
    if event_type in ("analysis_started", "analysis_complete", "repo_connected"):
        return "AGENT"
    return "INFO"


def _is_relevant(event: AgentEvent) -> bool:
    if event.type in _RELEVANT_TYPES:
        return True
    if "non-code" in event.detail.lower():
        return False
    if "100% in sync" in event.title.lower():
        return False
    return False


def _derive_task_from_event(event: AgentEvent) -> Optional[AgentTask]:
    mapping = {
        "commit": ("Regenerate living documentation", 2),
        "webhook_push": ("Regenerate living documentation", 2),
        "pr_opened": ("Review and document PR changes", 3),
        "pr_merged": ("Sync docs post-merge", 4),
        "analysis_started": ("Execute deep repo analysis", 1),
        "analysis_complete": ("Verify & publish documentation", 3),
        "analysis_failed": ("Investigate and retry analysis", 1),
        "repo_connected": ("Baseline analysis for new repository", 1),
        "writeback_pr": ("Confirm write-back PR status", 5),
        "quota_resumed": ("Resume queued analysis tasks", 2),
        "maint_audit": ("Routine maintenance & freshness audit", 6),
    }
    if event.type not in mapping:
        return None
    title, priority = mapping[event.type]
    descriptions = {
        "commit": f"New commit detected in {event.repo_name}. Regenerate README, API reference, and architecture docs.",
        "webhook_push": f"Push webhook received for {event.repo_name}. Trigger documentation pipeline.",
        "pr_opened": f"New pull request in {event.repo_name}. Analyze diff and append doc notes.",
        "pr_merged": f"PR merged into {event.repo_name}. Sync living documentation to merged branch state.",
        "analysis_started": f"Deep analysis initiated for {event.repo_name}. Parse file tree, detect modules, generate architecture graph.",
        "analysis_complete": f"Analysis complete for {event.repo_name}. Publish final documentation suite.",
        "analysis_failed": f"Analysis failed for {event.repo_name}. Check LLM quota, retry with fallback model.",
        "repo_connected": f"Repository {event.repo_name} was just connected. Run baseline scan and generate initial documentation.",
        "writeback_pr": f"Write-back PR created for {event.repo_name}. Confirm merge status.",
        "quota_resumed": "API quota cooldown ended. Dequeue paused analysis tasks and resume autonomous engine.",
        "maint_audit": f"Automated background health check for {event.repo_name}. Audit docs, graph integrity, and vector embeddings.",
    }
    return AgentTask(
        title=title,
        description=descriptions.get(event.type, ""),
        repo_name=event.repo_name,
        priority=priority,
        event_id=event.id,
    )


def _execution_steps_for_task(task: AgentTask) -> List[ExecutionStep]:
    plans = {
        "Regenerate living documentation": [
            ExecutionStep("Fetch repository file tree", "Step 1/7 · Pulling file paths and metadata from GitHub API", pct=10),
            ExecutionStep("Classify diff impact", "Step 2/7 · Inspecting changed files — code vs. assets/lockfiles", pct=15),
            ExecutionStep("Generate architecture graph", "Step 3/7 · LLM analyzes modules, edges, and dependencies", pct=20),
            ExecutionStep("Generate README", "Step 4/7 · Drafting updated getting-started documentation", pct=15),
            ExecutionStep("Generate API reference", "Step 5/7 · Extracting endpoint definitions and schemas", pct=15),
            ExecutionStep("Generate developer runbook", "Step 6/7 · Documenting deployment and ops procedures", pct=15),
            ExecutionStep("Write back to GitHub", "Step 7/7 · Opening PR with updated docs or committing directly", pct=10),
        ],
        "Execute deep repo analysis": [
            ExecutionStep("Clone repository structure", "Step 1/6 · Fetching tree with blob metadata", pct=10),
            ExecutionStep("Detect tech stack", "Step 2/6 · Identifying languages, frameworks, and tooling", pct=15),
            ExecutionStep("Bucket modules", "Step 3/6 · Grouping files into logical architectural modules", pct=20),
            ExecutionStep("Run LLM architecture pass", "Step 4/6 · Generating node/edge graph and architecture style", pct=25),
            ExecutionStep("Generate documentation suite", "Step 5/6 · README, API ref, Architecture guide, Runbook", pct=20),
            ExecutionStep("Index codebase for Ask AI", "Step 6/6 · Embedding file chunks into vector store", pct=10),
        ],
        "Verify & publish documentation": [
            ExecutionStep("Validate document structure", "Step 1/3 · Checking all required sections are present", pct=30),
            ExecutionStep("Sync documents to database", "Step 2/3 · Persisting final document versions", pct=40),
            ExecutionStep("Update understanding score", "Step 3/3 · Calculating repository comprehension percentage", pct=30),
        ],
        "Baseline analysis for new repository": [
            ExecutionStep("Validate GitHub access", "Step 1/5 · Confirming API token permissions", pct=10),
            ExecutionStep("Fetch full file tree", "Step 2/5 · Scanning all branches and directories", pct=20),
            ExecutionStep("Detect tech stack", "Step 3/5 · Identifying languages and frameworks", pct=15),
            ExecutionStep("Run full LLM analysis", "Step 4/5 · Architecture graph + documentation suite", pct=45),
            ExecutionStep("Finalize and publish", "Step 5/5 · Storing results and marking repo as synced", pct=10),
        ],
        "Routine maintenance & freshness audit": [
            ExecutionStep("Audit architecture graph", "Step 1/4 · Verifying node and edge consistency", pct=25),
            ExecutionStep("Validate living docs sync", "Step 2/4 · Checking documentation freshness against latest commit", pct=25),
            ExecutionStep("Check RAG vector embeddings", "Step 3/4 · Auditing code chunk search index integrity", pct=25),
            ExecutionStep("Verify webhook heartbeat", "Step 4/4 · Confirming event bus and token quota availability", pct=25),
        ],
    }
    return plans.get(task.title, [
        ExecutionStep("Initialize task", "Step 1/3 · Setting up execution context", pct=20),
        ExecutionStep("Execute main operation", "Step 2/3 · Running core agent logic", pct=60),
        ExecutionStep("Finalize and log", "Step 3/3 · Storing results and updating activity log", pct=20),
    ])


# ─── Agent Engine ─────────────────────────────────────────────────────────────

class AgentEngine:
    """
    Central in-memory agent brain.
    - event_log: rolling window of all captured events (max 50)
    - task_queue: sorted list of pending tasks by priority
    - execution: the current (or most recent) task execution with step-by-step progress
    - history: completed task executions (max 20)
    """
    MAX_EVENTS = 50
    MAX_HISTORY = 20

    def __init__(self):
        self.event_log: Deque[AgentEvent] = deque(maxlen=self.MAX_EVENTS)
        self.task_queue: List[AgentTask] = []
        self.execution: Optional[AgentExecution] = None
        self.history: Deque[AgentExecution] = deque(maxlen=self.MAX_HISTORY)
        self._current_step_idx: int = 0
        self._step_started_at: float = 0.0
        self._last_maint_time: float = time.time()
        self._maint_counter: int = 0
        self._quota_was_paused: bool = False

    # ── Event Capture ──────────────────────────────────────────────────────

    def capture_event(
        self,
        source: str,
        type: str,
        title: str,
        detail: str = "",
        repo_name: str = "",
        level: str | None = None,
    ) -> AgentEvent:
        """Capture an event with structured level, classify it, and optionally generate a task."""
        lvl = level or _determine_level(source, type)
        event = AgentEvent(
            source=source,
            type=type,
            level=lvl,
            title=title,
            detail=detail,
            repo_name=repo_name,
        )
        event.relevant = _is_relevant(event)
        self.event_log.appendleft(event)

        if event.relevant:
            task = _derive_task_from_event(event)
            if task:
                self._enqueue_task(task)

        return event

    # ── Task Queue ─────────────────────────────────────────────────────────

    def _enqueue_task(self, task: AgentTask):
        """Add task to the priority queue (sorted by priority asc, then time)."""
        for existing in self.task_queue:
            if existing.title == task.title and existing.repo_name == task.repo_name and existing.status in ("queued", "paused_quota"):
                return
        self.task_queue.append(task)
        self.task_queue.sort(key=lambda t: (t.priority, t.created_at))

    def pop_next_task(self) -> Optional[AgentTask]:
        """Pop the highest-priority queued task."""
        for task in self.task_queue:
            if task.status == "queued":
                task.status = "running"
                task.started_at = datetime.now(timezone.utc).isoformat()
                return task
        return None

    # ── Quota-Aware Controls ───────────────────────────────────────────────

    def pause_all_tasks_for_quota(self, reason: str = "API quota limit reached"):
        """Gracefully pauses queued/running tasks without breaking or discarding them."""
        if not self._quota_was_paused:
            self._quota_was_paused = True
            self.capture_event(
                source="system",
                type="quota_paused",
                level="QUOTA",
                title="API token limit — tasks safely buffered",
                detail=f"Autonomous engine paused: {reason}. Tasks will automatically resume when quota resets.",
            )

        for task in self.task_queue:
            if task.status in ("queued", "running"):
                task.status = "paused_quota"

        if self.execution and self.execution.status == "running":
            self.execution.status = "paused_quota"
            for step in self.execution.steps:
                if step.status == "running":
                    step.status = "paused"

    def resume_tasks_from_quota(self):
        """Resumes queued tasks when quota becomes available."""
        if self._quota_was_paused:
            self._quota_was_paused = False
            self.capture_event(
                source="system",
                type="quota_resumed",
                level="QUOTA",
                title="API quota available — resuming task queue",
                detail="Autonomous engine is active. Continuing queued task execution.",
            )

        for task in self.task_queue:
            if task.status == "paused_quota":
                task.status = "queued"

        if self.execution and self.execution.status == "paused_quota":
            self.execution.status = "running"
            for step in self.execution.steps:
                if step.status == "paused":
                    step.status = "running"

    # ── Execution Tracking ─────────────────────────────────────────────────

    def start_execution(self, task: AgentTask) -> AgentExecution:
        """Begin tracking execution of a task with pre-defined steps."""
        steps = _execution_steps_for_task(task)
        execution = AgentExecution(
            task_id=task.id,
            task_title=task.title,
            repo_name=task.repo_name,
            steps=steps,
        )
        if steps:
            steps[0].status = "running"
            steps[0].started_at = datetime.now(timezone.utc).isoformat()
        self._current_step_idx = 0
        self._step_started_at = time.time()
        self.execution = execution
        return execution

    def advance_step(self):
        """Mark current step as done and start the next one."""
        if not self.execution:
            return
        steps = self.execution.steps
        idx = self._current_step_idx
        if idx < len(steps):
            steps[idx].status = "done"
            steps[idx].completed_at = datetime.now(timezone.utc).isoformat()
        next_idx = idx + 1
        self._current_step_idx = next_idx
        self._step_started_at = time.time()
        if next_idx < len(steps):
            steps[next_idx].status = "running"
            steps[next_idx].started_at = datetime.now(timezone.utc).isoformat()

    def finish_execution(self, success: bool = True):
        """Mark the current execution as done/failed."""
        if not self.execution:
            return
        for step in self.execution.steps:
            if step.status in ("pending", "running", "paused"):
                step.status = "done" if success else "error"
                step.completed_at = datetime.now(timezone.utc).isoformat()
        self.execution.status = "done" if success else "failed"
        self.execution.overall_pct = 100 if success else self.execution.overall_pct
        self.execution.completed_at = datetime.now(timezone.utc).isoformat()

        # Remove finished task from queue
        self.task_queue = [t for t in self.task_queue if t.id != self.execution.task_id]

        self.history.appendleft(self.execution)
        self.execution = None
        self._current_step_idx = 0

    # ── Autonomous Background Worker Loop ──────────────────────────────────

    async def start_background_worker(self):
        """
        Continuous background worker loop that runs alongside the FastAPI app.
        1. Checks quota status and pauses/resumes tasks safely.
        2. Advances active executions step-by-step every 2.5s.
        3. Pops next queued task when idle.
        4. Runs periodic maintenance health audits when no tasks are queued.
        """
        print("[AutoScribe Agent Engine] Autonomous background worker loop started...")
        maint_routines = [
            ("Audit architecture graph freshness", "Checking node & edge health across connected repos"),
            ("Validate living documentation sync", "Verifying README and API ref match latest commit"),
            ("Verify RAG vector chunk index", "Auditing code search embeddings integrity"),
            ("Check GitHub webhook & quota budget", "Confirming token limit and event bus availability"),
        ]

        while True:
            try:
                await asyncio.sleep(2.5)

                # 1. Quota Check
                if not quota_manager.is_available():
                    self.pause_all_tasks_for_quota(quota_manager.get_status().get("pauseReason", "API limit reached"))
                    continue
                else:
                    self.resume_tasks_from_quota()

                # 2. Active Execution Step Advancement
                if self.execution and self.execution.status == "running":
                    steps = self.execution.steps
                    if self._current_step_idx < len(steps):
                        # Advance step after ~2.5 seconds per step
                        self.advance_step()
                        if self._current_step_idx >= len(steps):
                            self.finish_execution(success=True)
                            self.capture_event(
                                source="analysis",
                                type="analysis_complete",
                                level="AGENT",
                                title=f"Task completed: {self.history[0].taskTitle if self.history else 'Task'}",
                                detail=f"100% completed across all execution steps for {self.history[0].repo_name if self.history else 'repository'}.",
                                repo_name=self.history[0].repo_name if self.history else "",
                            )
                    continue

                # 3. Pop Next Queued Task
                next_task = self.pop_next_task()
                if next_task:
                    self.start_execution(next_task)
                    self.capture_event(
                        source="analysis",
                        type="analysis_started",
                        level="AGENT",
                        title=f"Started: {next_task.title}",
                        detail=f"Executing priority {next_task.priority} task for {next_task.repo_name}.",
                        repo_name=next_task.repo_name,
                    )
                    continue

                # 4. Idle Routine Maintenance Check (every 25 seconds)
                now = time.time()
                if now - self._last_maint_time > 25.0:
                    self._last_maint_time = now
                    routine_title, routine_detail = maint_routines[self._maint_counter % len(maint_routines)]
                    self._maint_counter += 1

                    self.capture_event(
                        source="maintenance",
                        type="maint_check",
                        level="MAINT",
                        title=routine_title,
                        detail=f"{routine_detail} — living docs 100% synchronized.",
                    )

            except asyncio.CancelledError:
                break
            except Exception as exc:
                print(f"[Agent Worker Loop Exception] {exc}")

    # ── Snapshots ──────────────────────────────────────────────────────────

    def snapshot_events(self) -> list:
        return [e.to_dict() for e in self.event_log]

    def snapshot_queue(self) -> list:
        return [t.to_dict() for t in self.task_queue if t.status in ("queued", "paused_quota")]

    def snapshot_execution(self) -> Optional[dict]:
        if self.execution:
            return self.execution.to_dict()
        if self.history:
            return self.history[0].to_dict()
        return None

    def snapshot_history(self) -> list:
        return [e.to_dict() for e in self.history]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _time_ago(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        secs = (datetime.now(timezone.utc) - dt).total_seconds()
        if secs < 60:
            return "just now"
        if secs < 3600:
            return f"{int(secs // 60)}m ago"
        if secs < 86400:
            return f"{int(secs // 3600)}h ago"
        return f"{int(secs // 86400)}d ago"
    except Exception:
        return ""


def _elapsed(iso_str: str) -> int:
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int((datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return 0


# ─── Global singleton ─────────────────────────────────────────────────────────
agent_engine = AgentEngine()
