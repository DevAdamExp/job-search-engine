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
import contextlib
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
# Never accepted through ``extra``: the service maps these itself, or they hijack the CLI.
RESERVED_FLAGS = set(COMMON_FLAGS) | {"location", "country", "remote", "help", "h", "q", "l", "n"}

# Where a portal does not take ``--location`` the way the contract suggests, say how the
# service's ``location`` field maps. Anything not listed maps to ``--location``.
LOCATION_FLAG = {
    "freehire-search": "--city",
    "jobindex-search": None,   # location goes inside the query on this board
}

# Minimum seconds between two calls to the same portal (robots Crawl-delay or politeness).
MIN_INTERVAL_S: dict[str, float] = {
    "jobbank-ca-search": 5.0,        # robots.txt Crawl-delay: 5
    "linkedin-search": 3.0,
    "themuse-search": 1.0,           # 500 requests/hour without a key
    "arbeitnow-search": 2.0,         # "please do not abuse"; a search reads up to 4 pages
    "jobicy-search": 10.0,           # terms ask for hourly polling; searches are user-triggered
    "himalayas-search": 2.0,
    "adzuna-search": 2.5,            # 25 requests/minute default quota
    "jsearch-search": 5.0,           # 200 requests/month on the free plan
    "jobtech-se-search": 1.0, "mycareersfuture-sg-search": 1.0, "jobroom-ch-search": 1.0, "arbeidsplassen-no-search": 1.0,
    "careerjet-search": 1.0, "reed-search": 1.0,
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
    # Coverage metadata from the SKILL.md frontmatter (see docs/PORTAL-METADATA.md):
    #   countries: ISO-3166 alpha-2 codes the board serves, or "*" (worldwide aggregator)
    #   official: a government / public-employment-service board
    #   requires_env: env vars (API keys) the CLI needs; missing → disabled with a reason
    #   sponsor_signal: how (if at all) a posting on this board reveals visa sponsorship
    title: str = ""
    countries: list[str] = field(default_factory=list)
    worldwide: bool = False
    official: bool = False
    requires_env: list[str] = field(default_factory=list)
    sponsor_signal: str = ""
    attribution: str = ""      # text that must be shown next to this board's rows (e.g. "Jobs by Adzuna")
    fallback: bool = False     # low-quota board: the CRM uses it only when nothing else covers a country
    disabled_reason: str = ""
    _last_call: float = field(default=0.0, repr=False)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

    def covers(self, country: str) -> bool:
        return self.worldwide or country.upper() in self.countries

    def summary(self) -> dict:
        return {
            "name": self.name, "title": self.title or self.name.removesuffix("-search"),
            "enabled": self.enabled, "version": self.version,
            "description": self.description.strip()[:300], "min_interval_s": self.min_interval_s,
            "cli": str(self.cli.relative_to(ROOT)) if self.cli.is_relative_to(ROOT) else str(self.cli),
            "countries": "*" if self.worldwide else self.countries, "official": self.official,
            "requires_env": self.requires_env, "sponsor_signal": self.sponsor_signal,
            "attribution": self.attribution, "fallback": self.fallback, "disabled_reason": self.disabled_reason,
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
        enabled = enabled if isinstance(enabled, bool) else str(enabled).lower() != "false"
        raw_cc = fm.get("countries") or []
        worldwide = raw_cc == "*" or raw_cc == ["*"]
        countries = [] if worldwide else sorted({str(c).upper() for c in _as_list(raw_cc) if _CC.match(str(c))})
        requires_env = [str(v) for v in _as_list(fm.get("requires_env") or [])]
        missing = [v for v in requires_env if not os.environ.get(v)]
        reason = ""
        if not enabled:
            reason = "disabled in SKILL.md"
        elif missing:
            enabled, reason = False, "missing_env:" + ",".join(missing)
        portals[name] = Portal(
            name=name, dir=skill.parent, cli=cli, enabled=enabled,
            version=str(fm.get("version", "")), description=str(fm.get("description", "")),
            min_interval_s=MIN_INTERVAL_S.get(name, DEFAULT_INTERVAL_S),
            title=str(fm.get("title", "") or ""),
            countries=countries, worldwide=worldwide, official=bool(fm.get("official", False)),
            requires_env=requires_env, sponsor_signal=str(fm.get("sponsor_signal", "") or ""),
            attribution=str(fm.get("attribution", "") or ""), fallback=bool(fm.get("fallback", False)),
            disabled_reason=reason,
        )
    return portals


_CC = re.compile(r"^[A-Za-z]{2}$")


def _as_list(v) -> list:
    if isinstance(v, (list, tuple)):
        # YAML 1.1 turns a bare NO into False (Norway!) — codes should be quoted, but stay safe.
        return ["NO" if x is False else x for x in v]
    return [x.strip() for x in str(v).split(",") if x.strip()]


def build_search_args(portal: Portal, *, query: str | None, location: str | None, jobage: int | None,
                      remote: str | None, page: int, limit: int, extra: dict[str, str] | None,
                      country: str | None = None) -> list[str]:
    args = ["search", "--format", "json", "--page", str(page), "--limit", str(limit)]
    # Boards serving several countries take --country (worldwide feeds and multi-country APIs like
    # Adzuna/Careerjet/Arbeitnow, which would otherwise default to GB); a single-country board's CLI
    # has no such flag.
    if country and (portal.worldwide or len(portal.countries) > 1):
        args += ["--country", country.upper()]
    # A value starting with "-" would be re-parsed as a flag by the CLIs' shared parseFlags
    # (e.g. "--help" prints usage to stdout with exit 0 → BAD_OUTPUT). Reject it up front.
    for label, value in (("query", query), ("location", location)):
        if value and value.lstrip().startswith("-"):
            raise PortalError(portal.name, "BAD_FLAG", f"{label} may not start with '-'")
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
        # 300: a browser user agent (Careerjet's terms want the real one) runs 110–140 characters.
        if not _FLAG_KEY.match(k) or k in RESERVED_FLAGS or not isinstance(v, str) or v.startswith("-") or len(v) > 300:
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
        with contextlib.suppress(ProcessLookupError):
            proc.kill()
        with contextlib.suppress(Exception):
            await asyncio.wait_for(proc.wait(), timeout=5)   # reap; never leave a zombie
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
    elif isinstance(raw, dict):
        meta, items = dict(raw.get("meta") or {}), list(raw.get("results") or [])
    else:
        raise PortalError(portal.name, "BAD_OUTPUT", "CLI returned no JSON object")
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
