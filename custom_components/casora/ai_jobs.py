"""Casora's AI jobs for your own assistant over MCP (issue #131).

MCP is pull-only: the assistant calls Home Assistant, Home Assistant cannot call the assistant. With the AI
option "Your own assistant (MCP)" (AI_MCP, stored in ai_task_entity or ai_task_web_entity) ki.generate() does
not call ai_task.generate_data. It queues a job, fires the event casora_ai_job and waits for the answer.

Admin actions, response only (SupportsResponse.ONLY):

  casora.ai_jobs → {"jobs": [{"job_id", "task_name", "instructions", "fields", "attachments", "created",
                              "expires"}], "how": str}
      fields: {key: {"type": "text" | "text list" | "yes/no" | "number" | "one of", "required": bool,
                     "options"?: [..], "description"?: str}} (from the ai_task structure)
      attachments: [{"media_content_id", "media_content_type", "camera_entity"?, "hint"}]
  casora.ai_answer {job_id, data: {..}} → {"ok": true, "job_id"} | {"ok": false, "job_id", "errors": [str]}
  casora.ai_cancel {job_id} → {"ok": true, "job_id"} | {"ok": false, "job_id", "errors": [str]}

Jobs live in memory only (hass.data[DOMAIN]["ai_jobs"], kept across a reload of the integration): a restart of
Home Assistant drops them, removing Casora fails them. At most MAX_JOBS wait at a time; the same task_name and
instructions while one is open share that job (both callers get its answer). No answer within the timeout
(JOB_TIMEOUT, 6 h): the job goes, the feature reports TIMEOUT.
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import timedelta
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# Stored instead of an ai_task entity id: the AI features wait for your own assistant over MCP.
AI_MCP = "mcp"
EVENT_JOB = "casora_ai_job"
JOB_TIMEOUT = timedelta(hours=6)
MAX_JOBS = 20
SERVICES = ("ai_jobs", "ai_answer", "ai_cancel")

# German like the other messages of the AI features (ki.NO_AI); the dashboard translates them (phrases/en.json).
TIMEOUT = "Dein Assistent hat nicht rechtzeitig geantwortet"
FULL = "Zu viele offene Aufträge für deinen Assistenten"
CANCELLED = "Der Auftrag für deinen Assistenten wurde abgebrochen"
GONE = "Casora wurde entfernt, der Auftrag ist verfallen"
LOST = "Neustart: der Auftrag für deinen Assistenten ist verfallen"

HOW = ("Do each job as its instructions say, then call casora.ai_answer with its job_id and data: an object with "
       "the keys of fields (required ones must be there, \"one of\" takes one of options, \"text list\" a list of "
       "strings). For an attachment with camera_entity, fetch that camera's current image yourself (for example "
       "with your camera image tool). casora.ai_cancel drops a job you cannot do. Call casora.ai_jobs again after "
       "answering: a flow may queue its next job then.")


def _kind(selector: Any) -> tuple[str, list | None]:
    """Readable type of an ai_task structure selector (and the options of a select)."""
    sel = selector if isinstance(selector, dict) else {}
    if "select" in sel:
        opts = (sel.get("select") or {}).get("options") or []
        return "one of", [o.get("value") if isinstance(o, dict) else o for o in opts]
    if "boolean" in sel:
        return "yes/no", None
    if "number" in sel:
        return "number", None
    if "text" in sel and ((sel.get("text") or {}).get("multiple")):
        return "text list", None
    return "text", None


def readable_fields(structure: dict | None) -> dict[str, dict]:
    """The structure of ai_task.generate_data as a schema an assistant can read."""
    out: dict[str, dict] = {}
    for key, spec in (structure or {}).items():
        spec = spec if isinstance(spec, dict) else {}
        kind, opts = _kind(spec.get("selector"))
        f: dict[str, Any] = {"type": kind, "required": bool(spec.get("required"))}
        if opts is not None:
            f["options"] = opts
        if spec.get("description"):
            f["description"] = str(spec["description"])
        out[str(key)] = f
    return out


def readable_attachments(attachments: list | None) -> list[dict]:
    """Attachments with what the assistant needs to fetch them itself (a camera image: the camera entity)."""
    out = []
    for a in attachments or []:
        if not isinstance(a, dict):
            continue
        mid = str(a.get("media_content_id") or "")
        item: dict[str, Any] = {"media_content_id": mid, "media_content_type": a.get("media_content_type") or ""}
        if mid.startswith("media-source://camera/"):
            item["camera_entity"] = mid.removeprefix("media-source://camera/")
            item["hint"] = "The current image of this camera: fetch it with your camera image tool."
        else:
            item["hint"] = "A Home Assistant media source item: fetch it with your media tool."
        out.append(item)
    return out


def validate_answer(structure: dict | None, data: Any) -> tuple[Any, list[str]]:
    """Check an answer against the structure: (cleaned data, errors).

    Required keys must be there and not empty, a select takes one of its options, yes/no a boolean, a number a
    number, a text list a list of texts (a single text becomes a list of one). Keys outside the structure are
    dropped. Without a structure the answer is free text: data {"text": "..."} (ai_task answers a string then).
    """
    if not isinstance(data, dict):
        return None, ["data must be an object"]
    if not structure:
        text = data.get("text")
        return (str(text), []) if isinstance(text, str) and text.strip() else (None, ["data needs the key text"])
    errors: list[str] = []
    out: dict[str, Any] = {}
    for key, spec in structure.items():
        spec = spec if isinstance(spec, dict) else {}
        kind, opts = _kind(spec.get("selector"))
        val = data.get(key)
        if val is None or val == [] or (isinstance(val, str) and not val.strip()):
            if spec.get("required"):
                errors.append(f"{key} is required")
            continue
        if kind == "one of":
            if val not in (opts or []):
                errors.append(f"{key} must be one of {', '.join(map(str, opts or []))}")
                continue
        elif kind == "yes/no":
            if not isinstance(val, bool):
                errors.append(f"{key} must be true or false")
                continue
        elif kind == "number":
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                try:
                    val = float(str(val).replace(",", "."))
                except ValueError:
                    errors.append(f"{key} must be a number")
                    continue
            if isinstance(val, float) and not math.isfinite(val):
                errors.append(f"{key} must be a number")
                continue
        elif kind == "text list":
            if isinstance(val, str):
                val = [val]
            if not isinstance(val, list) or not all(isinstance(x, (str, int, float)) for x in val):
                errors.append(f"{key} must be a list of texts")
                continue
            val = [str(x) for x in val]
        elif not isinstance(val, (str, int, float)) or isinstance(val, bool):
            errors.append(f"{key} must be a text")
            continue
        else:
            val = str(val)
        out[key] = val
    return out, errors


class AiJobs:
    """Pending jobs for your own assistant, in memory.

    Every caller waits on its own future (no shield: Python 3.14 logs a resolved shielded future as a loop
    error), the timeout is a loop timer per job. A job ends when it is answered, cancelled, timed out or its
    last caller stopped waiting (HA stops, the flow was cancelled) - whichever comes first.
    """

    def __init__(self, hass: HomeAssistant, timeout: timedelta = JOB_TIMEOUT, limit: int = MAX_JOBS) -> None:
        self.hass = hass
        self.timeout = timeout
        self.limit = limit
        self.jobs: dict[str, dict] = {}
        self._waiters: dict[str, list[asyncio.Future]] = {}
        self._timers: dict[str, asyncio.TimerHandle] = {}

    def _same(self, task_name: str, instructions: str) -> str | None:
        return next((jid for jid, j in self.jobs.items()
                     if j["task_name"] == task_name and j["instructions"] == instructions), None)

    async def ask(self, data: dict[str, Any]) -> dict:
        """Queue a job and wait for the answer; returns {"data": ...} like ai_task.generate_data."""
        task_name = str(data.get("task_name") or "")
        instructions = str(data.get("instructions") or "")
        # Two taps on the same button, or the same scheduled run twice: one job, one answer for both.
        jid = self._same(task_name, instructions)
        if jid is None:
            if len(self.jobs) >= self.limit:
                raise HomeAssistantError(FULL)
            now = dt_util.utcnow()
            jid = uuid.uuid4().hex[:12]
            self.jobs[jid] = {
                "job_id": jid, "task_name": task_name, "instructions": instructions,
                "structure": data.get("structure") or None, "attachments": list(data.get("attachments") or []),
                "created": now.isoformat(), "expires": (now + self.timeout).isoformat(),
            }
            self._waiters[jid] = []
            self._timers[jid] = self.hass.loop.call_later(self.timeout.total_seconds(), self._fail, jid, TIMEOUT)
            self.hass.bus.async_fire(EVENT_JOB, {"job_id": jid, "task_name": task_name, "pending": len(self.jobs)})
        fut: asyncio.Future = self.hass.loop.create_future()
        self._waiters[jid].append(fut)
        try:
            return {"data": await fut}
        finally:
            waiters = self._waiters.get(jid)
            if waiters is not None and fut in waiters:
                waiters.remove(fut)
                if not waiters:
                    # The last caller stopped waiting: nobody would read an answer any more.
                    self._drop(jid)

    def _drop(self, jid: str) -> None:
        self.jobs.pop(jid, None)
        self._waiters.pop(jid, None)
        timer = self._timers.pop(jid, None)
        if timer:
            timer.cancel()

    def _fail(self, jid: str, message: str) -> None:
        waiters = self._waiters.get(jid) or []
        self._drop(jid)
        for fut in waiters:
            if not fut.done():
                fut.set_exception(HomeAssistantError(message))

    def pending(self) -> list[dict]:
        """Open jobs as the assistant reads them (oldest first)."""
        return [{"job_id": j["job_id"], "task_name": j["task_name"], "instructions": j["instructions"],
                 "fields": readable_fields(j["structure"]), "attachments": readable_attachments(j["attachments"]),
                 "created": j["created"], "expires": j["expires"]}
                for j in sorted(self.jobs.values(), key=lambda x: x["created"])]

    def answer(self, jid: str, data: Any) -> dict:
        job = self.jobs.get(jid)
        if not job:
            return {"ok": False, "job_id": jid, "errors": ["unknown job_id (answered, cancelled, timed out or lost "
                                                           "in a restart); call casora.ai_jobs"]}
        clean, errors = validate_answer(job["structure"], data)
        if errors:
            return {"ok": False, "job_id": jid, "errors": errors}
        waiters = self._waiters.get(jid) or []
        self._drop(jid)
        for fut in waiters:
            if not fut.done():
                fut.set_result(clean)
        return {"ok": True, "job_id": jid}

    def cancel(self, jid: str) -> dict:
        if jid not in self.jobs:
            return {"ok": False, "job_id": jid, "errors": ["unknown job_id"]}
        self._fail(jid, CANCELLED)
        return {"ok": True, "job_id": jid}

    def fail_all(self, message: str = GONE) -> None:
        for jid in list(self.jobs):
            self._fail(jid, message)


def jobs_for(hass: HomeAssistant) -> AiJobs:
    """The one job queue of this Home Assistant (created on first use, kept across a reload)."""
    data = hass.data.setdefault(DOMAIN, {})
    jobs = data.get("ai_jobs")
    if jobs is None:
        jobs = data["ai_jobs"] = AiJobs(hass)
    return jobs


def async_setup_ai_jobs(hass: HomeAssistant) -> None:
    """Register casora.ai_jobs, casora.ai_answer and casora.ai_cancel (admins only, response only)."""

    async def list_jobs(call: ServiceCall) -> ServiceResponse:
        return {"jobs": jobs_for(hass).pending(), "how": HOW}

    async def answer(call: ServiceCall) -> ServiceResponse:
        return jobs_for(hass).answer(call.data["job_id"], call.data["data"])

    async def cancel(call: ServiceCall) -> ServiceResponse:
        return jobs_for(hass).cancel(call.data["job_id"])

    # Extra data is ignored (some MCP clients always send a target), as for casora.setup_overview.
    async_register_admin_service(hass, DOMAIN, "ai_jobs", list_jobs, vol.Schema({}, extra=vol.ALLOW_EXTRA),
                                 supports_response=SupportsResponse.ONLY)
    async_register_admin_service(hass, DOMAIN, "ai_answer", answer, vol.Schema(
        {vol.Required("job_id"): cv.string, vol.Required("data"): dict}, extra=vol.ALLOW_EXTRA),
        supports_response=SupportsResponse.ONLY)
    async_register_admin_service(hass, DOMAIN, "ai_cancel", cancel, vol.Schema(
        {vol.Required("job_id"): cv.string}, extra=vol.ALLOW_EXTRA), supports_response=SupportsResponse.ONLY)


def async_unload_ai_jobs(hass: HomeAssistant) -> None:
    """Unload: only the services go. Every unload may be a reload (options saved, the integrations page's
    Reload), and the running flows survive it - the open jobs stay with them."""
    for name in SERVICES:
        hass.services.async_remove(DOMAIN, name)


def async_remove_ai_jobs(hass: HomeAssistant) -> None:
    """Casora removed: the open jobs fail with a clear message."""
    jobs = hass.data.get(DOMAIN, {}).pop("ai_jobs", None)
    if jobs:
        jobs.fail_all()
