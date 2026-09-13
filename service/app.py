"""job-search-engine service: an HTTP face over the upstream portal CLIs.

Runs beside the Visa CRM (internal network only; the CRM proxies it and owns tenants,
permissions, audit and the sponsor registers). Auth is one shared secret in
``X-Engine-Token``; set ``JOB_ENGINE_DEV=1`` to run without it locally.

    GET  /health            liveness + bun version + portal count
    GET  /portals           the discovered portal skills and their switches
    POST /search            one portal
    POST /search/multi      several portals in parallel; per-portal errors reported, never fatal
    GET  /detail            one posting's full record via the portal's ``detail`` command
"""
from __future__ import annotations

import asyncio
import os
import subprocess
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from . import portals as P

app = FastAPI(title="job-search-engine", version="0.1.0", docs_url=None, redoc_url=None)

_PORTALS: dict[str, P.Portal] = P.discover()
JOB_AGES = {1, 7, 14, 30}


def _require_token(x_engine_token: str | None = Header(default=None)) -> None:
    if os.environ.get("JOB_ENGINE_DEV") == "1":
        return
    expected = os.environ.get("JOB_ENGINE_TOKEN")
    if not expected:
        raise HTTPException(503, "JOB_ENGINE_TOKEN is not configured")
    if x_engine_token != expected:
        raise HTTPException(401, "bad engine token")


def _portal(name: str) -> P.Portal:
    p = _PORTALS.get(name)
    if not p:
        raise HTTPException(404, f"unknown portal {name!r}")
    if not p.enabled:
        raise HTTPException(409, f"portal {name!r} is disabled")
    return p


class SearchRequest(BaseModel):
    portal: str = Field(min_length=1, max_length=60)
    query: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=120)
    jobage: int | None = None          # days: 1 | 7 | 14 | 30
    remote: Literal["remote", "hybrid", "onsite"] | None = None
    page: int = Field(default=1, ge=1, le=50)
    limit: int = Field(default=20, ge=1, le=50)
    extra: dict[str, str] = Field(default_factory=dict)   # portal-specific flags, passed as --k v


class MultiSearchRequest(BaseModel):
    portals: list[str] = Field(min_length=1, max_length=10)
    query: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=120)
    jobage: int | None = None
    remote: Literal["remote", "hybrid", "onsite"] | None = None
    limit: int = Field(default=20, ge=1, le=50)
    extra: dict[str, dict[str, str]] = Field(default_factory=dict)  # per-portal extra flags


def _check_jobage(v: int | None) -> None:
    if v is not None and v not in JOB_AGES:
        raise HTTPException(422, "jobage must be one of 1, 7, 14, 30")


async def _search_one(p: P.Portal, req: SearchRequest) -> dict:
    args = P.build_search_args(
        p, query=req.query, location=req.location, jobage=req.jobage, remote=req.remote,
        page=req.page, limit=req.limit, extra=req.extra,
    )
    raw = await P.run_cli(p, args)
    meta, results = P.normalise(p, raw)
    return {"portal": p.name, "meta": meta, "results": results}


@app.get("/health")
async def health() -> dict:
    try:
        bun = subprocess.run([P.BUN, "--version"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        bun = None
    return {"ok": bool(bun), "bun": bun, "portals": len(_PORTALS),
            "enabled": sorted(n for n, p in _PORTALS.items() if p.enabled)}


@app.get("/portals", dependencies=[Depends(_require_token)])
async def list_portals() -> dict:
    return {"portals": [p.summary() for p in _PORTALS.values()]}


@app.post("/search", dependencies=[Depends(_require_token)])
async def search(req: SearchRequest) -> dict:
    _check_jobage(req.jobage)
    p = _portal(req.portal)
    try:
        return await _search_one(p, req)
    except P.PortalError as e:
        raise HTTPException(502, {"portal": e.portal, "code": e.code, "error": e.message})


@app.post("/search/multi", dependencies=[Depends(_require_token)])
async def search_multi(req: MultiSearchRequest) -> dict:
    _check_jobage(req.jobage)
    ps = [_portal(n) for n in dict.fromkeys(req.portals)]

    async def one(p: P.Portal) -> dict:
        sub = SearchRequest(portal=p.name, query=req.query, location=req.location, jobage=req.jobage,
                            remote=req.remote, limit=req.limit, extra=req.extra.get(p.name, {}))
        try:
            return await _search_one(p, sub)
        except P.PortalError as e:
            return {"portal": p.name, "meta": {"count": 0}, "results": [],
                    "error": {"code": e.code, "message": e.message}}

    parts = await asyncio.gather(*(one(p) for p in ps))
    seen: set[str] = set()
    merged = []
    for part in parts:
        for r in part["results"]:
            if r["key"] in seen:
                continue
            seen.add(r["key"])
            merged.append(r)
    return {"results": merged, "portals": [{k: v for k, v in part.items() if k != "results"} for part in parts]}


@app.get("/detail", dependencies=[Depends(_require_token)])
async def detail(portal: str = Query(..., max_length=60), id: str = Query(..., min_length=1, max_length=300)) -> dict:
    p = _portal(portal)
    if id.startswith("-"):
        raise HTTPException(422, "bad id")
    try:
        raw = await P.run_cli(p, ["detail", id, "--format", "json"])
    except P.PortalError as e:
        raise HTTPException(404 if e.code == "NOT_FOUND" else 502,
                            {"portal": e.portal, "code": e.code, "error": e.message})
    if not isinstance(raw, dict):
        raise HTTPException(502, {"portal": p.name, "code": "BAD_OUTPUT", "error": "detail did not return an object"})
    raw["portal"] = p.name
    return raw
