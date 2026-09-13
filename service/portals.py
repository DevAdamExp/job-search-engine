"""Portal registry + CLI runner for the job-search engine service.

The upstream repo ships one zero-dependency Bun CLI per job board under
``.agents/skills/<name>-search/cli`` behind a single contract (``search`` / ``detail``,
JSON on stdout, ``{"error","code"}`` on stderr). This module discovers those skills from
their ``SKILL.md`` frontmatter, maps the service's common request fields onto each
CLI's flags, runs the CLI as a subprocess with a timeout, enforces a per-portal minimum
interval (a board's robots ``Crawl-delay`` is a promise we keep), and normalises every
result to one shape with the upstream's canonical dedupe key attached.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = ROOT / ".agents" / "skills"
sys.path.insert(0, str(ROOT))
from tools.job_key import make_key  # noqa: E402  (upstream, stdlib-only)

CLI_TIMEOUT_S = float(os.environ.get("JOB_ENGINE_CLI_TIMEOUT", "60"))
BUN = os.environ.get("BUN_BIN", "bun")

# Flags the contract guarantees (add-portal.md "portal-skill contract"); a portal may add
# its own, which callers pass through ``extra``.
COMMON_FLAGS = ("query", "jobage", "page", "limit", "format")

# Where a portal does not take ``--location`` the way the contract suggests, say how the
# service's ``location`` field maps. Anything not listed maps to ``--location``.
LOCATION_FLAG = {
    "freehire-search": "--city",
    "jobindex-search": None,   # location goes inside the query on this board
}

# Minimum seconds between two calls to the same portal (robots Crawl-delay or politeness).
MIN_INTERVAL_S = {
    "jobbank-ca-search": 5.0,   # www.jobbank.gc.ca/robots.txt: Crawl-delay: 5
    "linkedin-search": 3.0,     # personal-use terms: keep volume low
}
DEFAULT_INTERVAL_S = 1.0

_FLAG_KEY = re.compile(r"^[a-z][a-z0-9-]{0,30}$")


class PortalError(Exception):
    def __init__(self, portal: str, code: str, message: str):
        super().__init__(f"{portal}: {code}: {message}")
        self.portal, self.code, self.message = portal, code, message


@dataclass
class Portal:
    name: str
    dir: Path
    cli: Path
    enabled: bool
    version: str = ""
    description: str = ""
    min_interval_s: float = DEFAULT_INTERVAL_S
    _last_call: float = field(default=0.0, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def summary(self) -> dict:
        return {
            "name": self.name, "enabled": self.enabled, "version": self.version,
            "description": self.description.strip()[:300], "min_interval_s": self.min_interval_s,
            "cli": str(self.cli.relative_to(ROOT)) if self.cli.is_relative_to(ROOT) else str(self.cli),
        }


def _frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    try:
        data = yaml.safe_load(text[3:end]) or {}
    except yaml.YAMLError:
        return {}
    return data if isinstance(data, dict) else {}


def discover(skills_dir: Path = SKILLS_DIR) -> dict[str, Portal]:
    """Every ``<skills_dir>/*/SKILL.md`` with a ``cli/src/cli.ts`` is a portal. ``enabled``
    defaults to true (a missing key means enabled, as the upstream scraper treats it)."""
    portals: dict[str, Portal] = {}
    if not skills_dir.is_dir():
        return portals
    for skill in sorted(skills_dir.glob("*/SKILL.md")):
        cli = skill.parent / "cli" / "src" / "cli.ts"
        if not cli.is_file():
            continue
        fm = _frontmatter(skill)
        name = str(fm.get("name") or skill.parent.name)
        enabled = fm.get("enabled", True)
        portals[name] = Portal(
            name=name, dir=skill.parent, cli=cli,
            enabled=enabled if isinstance(enabled, bool) else str(enabled).lower() != "false",
            version=str(fm.get("version", "")), description=str(fm.get("description", "")),
            min_interval_s=MIN_INTERVAL_S.get(name, DEFAULT_INTERVAL_S),
        )
    return portals


def build_search_args(portal: Portal, *, query: str | None, location: str | None, jobage: int | None,
                      remote: str | None, page: int, limit: int, extra: dict[str, str] | None) -> list[str]:
    args = ["search", "--format", "json", "--page", str(page), "--limit", str(limit)]
    if query:
        args += ["--query", query]
    if location:
        flag = LOCATION_FLAG.get(portal.name, "--location")
        if flag:
            args += [flag, location]
        elif query is None:
            args += ["--query", location]
    if jobage:
        args += ["--jobage", str(jobage)]
    if remote:
        args += ["--remote", remote]
    for k, v in (extra or {}).items():
        if not _FLAG_KEY.match(k) or k in COMMON_FLAGS or v.startswith("-") or len(v) > 100:
            raise PortalError(portal.name, "BAD_FLAG", f"rejected extra flag {k!r}")
        args += [f"--{k}", v]
    return args


async def run_cli(portal: Portal, args: list[str], timeout: float = CLI_TIMEOUT_S) -> dict | list:
    """Run ``bun run <cli> <args>`` honouring the portal's minimum interval; parse stdout JSON;
    turn the CLI's stderr ``{"error","code"}`` into a PortalError."""
    async with portal._lock:
        wait = portal.min_interval_s - (time.monotonic() - portal._last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        portal._last_call = time.monotonic()
    proc = await asyncio.create_subprocess_exec(
        BUN, "run", str(portal.cli), *args,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=str(portal.dir),
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise PortalError(portal.name, "TIMEOUT", f"CLI exceeded {timeout:.0f}s")
    if proc.returncode != 0:
        code, message = "CLI_FAILED", (err or out).decode("utf-8", "replace").strip()[:500]
        for line in reversed(err.decode("utf-8", "replace").splitlines()):
            try:
                payload = json.loads(line)
                code, message = str(payload.get("code", code)), str(payload.get("error", message))
                break
            except ValueError:
                continue
        raise PortalError(portal.name, code, message)
    try:
        return json.loads(out.decode("utf-8", "replace") or "null")
    except ValueError:
        raise PortalError(portal.name, "BAD_OUTPUT", "CLI did not return JSON")


RESULT_FIELDS = ("id", "title", "company", "location", "date", "url")


def normalise(portal: Portal, raw: dict | list) -> tuple[dict, list[dict]]:
    """``(meta, results)`` with every result carrying the contract fields (``null`` when the
    portal omitted one), the portal name, the canonical dedupe key and a fetch timestamp."""
    if isinstance(raw, list):
        meta, items = {"count": len(raw)}, raw
    else:
        meta, items = dict(raw.get("meta") or {}), list(raw.get("results") or [])
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        row = {f: item.get(f) for f in RESULT_FIELDS}
        for k, v in item.items():
            if k not in row:
                row[k] = v
        row["id"] = str(row["id"]) if row["id"] is not None else None
        row["portal"] = portal.name
        row["key"] = make_key(row.get("company") or "", row.get("title") or "", row.get("url") or "")
        row["fetched_at"] = now
        out.append(row)
    meta["count"] = len(out)
    return meta, out
