"""Release notes for the AI update check (ki/update.yaml), collected server-side before the AI is asked.

The AI task usually cannot fetch web pages itself: every check then ended with "release notes not
retrievable" and the verdict "unknown". So Casora gathers the notes per update entity first:

  1. the entity's own full notes (UpdateEntity.async_release_notes, the same call HA's websocket
     command update/release_notes makes; HACS repositories, apps/add-ons, Casora itself)
  2. the entity's release_summary (short, HA allows 255 characters; combined with 3./4.)
  3. GitHub's releases API when release_url points to github.com/<owner>/<repo>/releases/…:
     every release after the installed version up to the new one (skipped versions included)
  4. the release_url page as plain text (changelog pages of device makers, ESPHome, …)

Casora's own entity gets its localized notes of all newer versions (release_notes.notes_for_ai).
Results are trimmed to LIMIT characters and cached per entity and version pair; GitHub requests share
update_source's ETag cache and rate-limit pause (anonymous, 60 per hour).
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from datetime import datetime
from html.parser import HTMLParser
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN, UPDATE_REPO, VERSION
from .release_notes import compare_versions, newer, norm_version, notes_for_ai, version_key
from .update_source import fetch_releases, fetch_repo_releases, gh_headers

_LOGGER = logging.getLogger(__name__)

LIMIT = 12000  # characters of notes per update handed to the AI
PAGE_MAX_BYTES = 2 * 1024 * 1024  # never read more of a release page
NEGATIVE_TTL_S = 3600  # nothing found, or only a part (GitHub unreachable): retried after an hour
MAX_TODO = 3  # ki/update.yaml checks at most three updates per run
FRESH_S = 21600  # ki/update.yaml: a running/failed check younger than 6 h is not repeated
_CACHE = "update_ai_notes"
RELEASE_NOTES_FEATURE = 16  # UpdateEntityFeature.RELEASE_NOTES

_GH_RELEASES = re.compile(r"^https?://github\.com/([\w-][\w.-]*)/([\w-][\w.-]*?)(?:\.git)?/releases(?:[/?#]|$)", re.I)
_GH_BLOB = re.compile(r"^https?://github\.com/([\w.-]+)/([\w.-]+)/blob/(.+)$", re.I)


# ── pure helpers (tested in dev/unit/update_ai_notes_test.py) ──────────────────────────────────────────────
def github_repo(url: Any) -> str | None:
    """https://github.com/owner/repo/releases/tag/v1 → "owner/repo"; other URLs → None."""
    m = _GH_RELEASES.match(str(url or "").strip())
    return f"{m.group(1)}/{m.group(2)}" if m else None


def raw_url(url: str) -> str:
    """A file on github.com (…/blob/<ref>/<path>) is fetched raw instead of as a rendered page."""
    m = _GH_BLOB.match(url)
    return f"https://raw.githubusercontent.com/{m.group(1)}/{m.group(2)}/{m.group(3)}" if m else url


class _Text(HTMLParser):
    """Linear HTML → text (no regex over the whole page: unclosed tags cannot make it quadratic)."""

    # Only elements whose content is never prose; an unclosed one is reset at <body> (HTML5 allows
    # leaving out </head>, so skipping <head> or <nav> could hide the whole page).
    SKIP = {"script", "style", "noscript", "template"}
    BLOCK = {"br", "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article", "ul", "ol"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.skip = 0
        elif tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n- " if tag == "li" else "\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_text(src: str) -> str:
    """HTML page → plain text with line breaks at block elements (runs in the executor)."""
    p = _Text()
    try:
        p.feed(src)
        p.close()
    except Exception:  # noqa: BLE001 - broken markup: whatever was read so far
        pass
    s = re.sub(r"[ \t\r\f\v]+", " ", "".join(p.out))
    s = re.sub(r"\n\s*\n+", "\n\n", s)
    return "\n".join(line.strip() for line in s.split("\n")).strip()


def _version_variants(v: Any) -> list[str]:
    s = str(v or "").strip()
    out = [s, s[1:] if s[:1] in ("v", "V") else "", norm_version(s)]
    return [x for i, x in enumerate(out) if x and x not in out[:i]]


def _heading_at(text: str, v: Any, start: int = 0) -> int:
    """Start of the line that names version v as a heading ("## 1.2.3", "Version 1.2.3", "v1.2.3 (date)"),
    else of the first line mentioning it; -1 if v does not occur."""
    for strict in (True, False):
        for var in _version_variants(v):
            esc = re.escape(var)
            pat = (rf"(?im)^[ \t#*\[>-]*(?:version|release|v)?[ \t]*{esc}(?![\w.])" if strict
                   else rf"(?<![\w.]){esc}(?![\w.])")
            m = re.compile(pat).search(text, start)
            if m:
                return text.rfind("\n", 0, m.start()) + 1
    return -1


def window(text: str, v_from: Any, v_to: Any, limit: int = LIMIT, need_version: bool = False) -> str:
    """Cut a changelog (newest first) to the part about the update: from the new version's heading down
    to the installed version's heading. Without the new version in the text: its beginning, or "" with
    need_version (a web page that does not name the version is no release note: menus, cookie banners)."""
    text = (text or "").strip()
    if not text:
        return ""
    if "backward-incompatible changes" in text.lower():  # Home Assistant release blog posts
        i = text.lower().index("backward-incompatible changes")
        return text[i:i + limit].strip()
    start = _heading_at(text, v_to)
    if start < 0:
        return "" if need_version else text[:limit].strip()
    end = _heading_at(text, v_from, start + 1) if v_from and str(v_from) != str(v_to) else -1
    part = text[start:end] if end > start else text[start:]
    return part[:limit].strip()


def pick_github(releases: list[dict], v_from: Any, v_to: Any, limit: int = LIMIT) -> str:
    """Bodies of all releases after v_from up to v_to, oldest first; too long: the newest stay whole."""
    rows = []
    for r in releases or []:
        if not isinstance(r, dict) or r.get("draft"):
            continue
        tag = str(r.get("tag_name") or "")
        body = re.sub(r"(?s)<!--.*?-->", "", str(r.get("body") or "")).strip()
        if not tag or not body:
            continue
        v = norm_version(tag)
        if not v:
            continue
        if (not v_from or newer(v, v_from)) and compare_versions(v, v_to) <= 0:
            rows.append((v, tag, body))
    if not rows:  # tags that do not compare: at least the release of the new version
        want = set(_version_variants(v_to))
        for r in releases or []:
            tag, body = str((r or {}).get("tag_name") or ""), str((r or {}).get("body") or "").strip()
            if body and not r.get("draft") and (tag in want or norm_version(tag) in want):
                rows = [(norm_version(tag) or tag, tag, body)]
                break
    rows.sort(key=lambda x: version_key(x[0]))
    parts: list[str] = []
    size = 0
    for _, tag, body in reversed(rows):
        block = f"## {tag}\n{body}"
        if parts and size + len(block) > limit:
            break
        parts.insert(0, block[:limit])
        size += len(block) + 2
    return "\n\n".join(parts)


def todo_entities(states: list, analysen: list[dict], request: str = "", now: datetime | None = None) -> list[str]:
    """Which updates ki/update.yaml will check (same rule as its "todo" template): the requested one if it
    is on, else the first MAX_TODO pending updates without a current analysis."""
    if request:
        return [s.entity_id for s in states if s.entity_id == request and s.state == "on"][:1]
    now = now or datetime.now().astimezone()
    out = []
    for s in states:
        if not s.entity_id.startswith("update.") or s.state != "on" or s.attributes.get("in_progress"):
            continue
        it = next((a for a in analysen or [] if isinstance(a, dict) and a.get("id") == s.entity_id), None)
        fresh = False
        if it is not None and str(it.get("to")) == str(s.attributes.get("latest_version")):
            age = 999999.0
            try:
                age = (now - datetime.fromisoformat(str(it.get("checked")))).total_seconds()
            except (TypeError, ValueError):
                pass
            fresh = it.get("status") == "done" or age < FRESH_S
        if not fresh:
            out.append(s.entity_id)
    return out[:MAX_TODO]


# ── fetching ────────────────────────────────────────────────────────────────────────────────────────────
def _update_component(hass: HomeAssistant):
    """HA's update EntityComponent (what websocket update/release_notes uses), or None."""
    try:
        from homeassistant.components.update import DATA_COMPONENT
    except ImportError:  # pragma: no cover - older/newer HA without the key
        return None
    return hass.data.get(DATA_COMPONENT)


async def entity_notes(hass: HomeAssistant, entity_id: str) -> str:
    """Full release notes from the update entity itself, "" if it offers none."""
    comp = _update_component(hass)
    ent = comp.get_entity(entity_id) if comp is not None else None
    if ent is None or ent.available is False or not (int(ent.supported_features or 0) & RELEASE_NOTES_FEATURE):
        return ""
    try:
        return str(await asyncio.wait_for(ent.async_release_notes(), 30) or "").strip()
    except Exception as err:  # noqa: BLE001 - foreign integration: any failure means "no notes"
        _LOGGER.debug("Casora: release notes of %s not available: %s", entity_id, err)
        return ""


_PAGE_TYPES = ("text/html", "text/plain", "text/markdown", "text/x-markdown", "application/xhtml+xml")


async def page_text(hass: HomeAssistant, url: str) -> str:
    """The release page as plain text, "" when it cannot be read or is no text page."""
    if not re.match(r"^https?://", url or "", re.I):
        return ""
    target = raw_url(url)
    headers = {"User-Agent": gh_headers()["User-Agent"], "Accept": "text/html,text/plain,text/markdown;q=0.9"}
    try:
        async with async_get_clientsession(hass).get(target, headers=headers, timeout=20) as resp:
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if resp.status >= 400 or not any(t in ctype for t in _PAGE_TYPES):
                return ""
            chunks, size = [], 0
            async for chunk in resp.content.iter_chunked(65536):
                chunks.append(chunk)
                size += len(chunk)
                if size >= PAGE_MAX_BYTES:
                    break
    except Exception as err:  # noqa: BLE001 - offline, timeout, TLS
        _LOGGER.debug("Casora: release page %s not readable: %s", url, err)
        return ""
    data = b"".join(chunks)[:PAGE_MAX_BYTES]
    try:
        text = data.decode(resp.charset or "utf-8", errors="replace")
    except LookupError:  # unknown charset name in the header
        text = data.decode("utf-8", errors="replace")
    if "html" in ctype:
        return await hass.async_add_executor_job(html_text, text)
    return text.strip()


async def collect(hass: HomeAssistant, entity_id: str) -> dict[str, str]:
    """{"text": notes, "source": where they came from}; text "" when nothing was found."""
    st = hass.states.get(entity_id)
    if st is None:
        return {"text": "", "source": ""}
    attrs = st.attributes
    v_from, v_to = str(attrs.get("installed_version") or ""), str(attrs.get("latest_version") or "")
    url = str(attrs.get("release_url") or "")
    cache: dict = hass.data.setdefault(DOMAIN, {}).setdefault(_CACHE, {})
    key = f"{entity_id}|{v_from}|{v_to}"
    hit = cache.get(key)
    if hit and ((hit[1]["text"] and not hit[1].get("partial")) or time.time() - hit[0] < NEGATIVE_TTL_S):
        return hit[1]

    out = {"text": "", "source": ""}
    partial = False  # a source failed (GitHub limit, offline): cache only briefly
    try:
        if UPDATE_REPO.lower() + "/" in url.lower() + "/":
            text = notes_for_ai(await fetch_releases(hass), VERSION, hass.config.language, limit=LIMIT)
            if text:
                out = {"text": text, "source": f"GitHub releases {UPDATE_REPO}"}
        if not out["text"]:
            text = await entity_notes(hass, entity_id)
            if text:
                out = {"text": window(text, v_from, v_to), "source": "release notes of the update entity"}
        if not out["text"]:
            summary = re.sub(r"<[^>]+>", "", str(attrs.get("release_summary") or "")).strip()[:1000]
            room = LIMIT - len(summary) - 2
            more, src = "", ""
            repo = github_repo(url)
            if repo:
                try:
                    more = pick_github(await fetch_repo_releases(hass, repo), v_from, v_to, limit=room)
                    src = f"GitHub releases {repo}"
                except Exception as err:  # noqa: BLE001 - rate limit, offline: try the page
                    partial = True
                    _LOGGER.debug("Casora: GitHub releases of %s not loaded: %s", repo, err)
            if not more and url:
                more = window(await page_text(hass, url), v_from, v_to, limit=room, need_version=True)
                src = url
            parts = [p for p in (summary, more) if p]
            if parts:
                srcs = [s for s in ("release_summary" if summary else "", src if more else "") if s]
                out = {"text": "\n\n".join(parts), "source": ", ".join(srcs)}
    except Exception as err:  # noqa: BLE001 - never let a note source break the check
        partial = True
        _LOGGER.debug("Casora: release notes for %s failed: %s", entity_id, err)
    if partial:
        out = {**out, "partial": True}
    cache[key] = (time.time(), out)
    if len(cache) > 64:
        for k in sorted(cache, key=lambda k: cache[k][0])[: len(cache) - 64]:
            cache.pop(k, None)
    return out


async def notes_for_updates(hass: HomeAssistant, request: str, analysen: list[dict]) -> dict[str, dict[str, str]]:
    """Notes for every update the next run of ki/update.yaml will check, by entity id."""
    eids = todo_entities(hass.states.async_all("update"), analysen, request)
    results = await asyncio.gather(*(collect(hass, e) for e in eids))
    return dict(zip(eids, results))
