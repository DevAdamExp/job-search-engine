"""Service tests: portal discovery, flag mapping, normalisation, auth, and the HTTP surface
with the CLI runner stubbed (no network, no bun)."""
from __future__ import annotations

import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from service import app as app_module
from service import portals as P


def _mk_skill(root: Path, name: str, enabled: bool | None = True, with_cli: bool = True) -> None:
    d = root / name
    (d / "cli" / "src").mkdir(parents=True)
    fm = f"---\nname: {name}\nversion: 1.0.0\ndescription: >\n  test portal {name}\n"
    if enabled is not None:
        fm += f"enabled: {'true' if enabled else 'false'}\n"
    fm += "---\n# body\n"
    (d / "SKILL.md").write_text(fm)
    if with_cli:
        (d / "cli" / "src" / "cli.ts").write_text("// stub")


class DiscoverTests(unittest.TestCase):
    def test_discovers_enabled_flag_and_skips_skills_without_a_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _mk_skill(root, "a-search")
            _mk_skill(root, "b-search", enabled=False)
            _mk_skill(root, "c-search", enabled=None)       # missing key = enabled
            _mk_skill(root, "d-search", with_cli=False)     # not a portal
            ps = P.discover(root)
            self.assertEqual(sorted(ps), ["a-search", "b-search", "c-search"])
            self.assertTrue(ps["a-search"].enabled)
            self.assertFalse(ps["b-search"].enabled)
            self.assertTrue(ps["c-search"].enabled)
            self.assertEqual(ps["a-search"].version, "1.0.0")

    def test_real_repo_skills_are_discovered(self):
        ps = P.discover()
        self.assertIn("linkedin-search", ps)
        self.assertIn("freehire-search", ps)


class ArgsTests(unittest.TestCase):
    def _p(self, name="x-search"):
        return P.Portal(name=name, dir=Path("."), cli=Path("cli.ts"), enabled=True)

    def test_common_flags(self):
        args = P.build_search_args(self._p(), query="nurse", location="Leeds", jobage=14, remote="remote",
                                   page=2, limit=10, extra={"seniority": "senior"})
        self.assertEqual(args, ["search", "--format", "json", "--page", "2", "--limit", "10",
                                "--query", "nurse", "--location", "Leeds", "--jobage", "14",
                                "--remote", "remote", "--seniority", "senior"])

    def test_location_mapping_per_portal(self):
        fh = P.build_search_args(self._p("freehire-search"), query="go", location="Berlin", jobage=None,
                                 remote=None, page=1, limit=5, extra=None)
        self.assertIn("--city", fh)
        ji = P.build_search_args(self._p("jobindex-search"), query=None, location="Aarhus", jobage=None,
                                 remote=None, page=1, limit=5, extra=None)
        self.assertEqual(ji[-2:], ["--query", "Aarhus"])   # folded into the query

    def test_extra_flags_are_validated(self):
        for bad in ({"--x": "1"}, {"limit": "99"}, {"k": "-v"}, {"K": "v"}, {"a" * 40: "v"},
                    {"location": "Berlin"}, {"help": "x"}, {"remote": "remote"}):
            with self.assertRaises(P.PortalError):
                P.build_search_args(self._p(), query="q", location=None, jobage=None, remote=None,
                                    page=1, limit=5, extra=bad)

    def test_query_and_location_may_not_start_with_a_dash(self):
        for q, loc in (("--help", None), ("-h", None), ("nurse", "--x"), ("  -q", None)):
            with self.assertRaises(P.PortalError):
                P.build_search_args(self._p(), query=q, location=loc, jobage=None, remote=None,
                                    page=1, limit=5, extra=None)


class NormaliseTests(unittest.TestCase):
    def test_contract_fields_key_and_portal(self):
        p = P.Portal(name="x-search", dir=Path("."), cli=Path("cli.ts"), enabled=True)
        meta, rows = P.normalise(p, {"meta": {"page": 1}, "results": [
            {"id": 123, "title": "Nurse", "company": "NHS", "url": "https://x/1", "extra": "y"},
            "garbage",
        ]})
        self.assertEqual(meta, {"page": 1, "count": 1})
        row = rows[0]
        self.assertEqual(row["id"], "123")
        self.assertIsNone(row["location"])
        self.assertIsNone(row["date"])
        self.assertEqual(row["portal"], "x-search")
        self.assertEqual(row["extra"], "y")
        self.assertTrue(row["key"].startswith("nhs_nurse"))
        self.assertTrue(row["fetched_at"])

    def test_bare_list_output(self):
        p = P.Portal(name="x-search", dir=Path("."), cli=Path("cli.ts"), enabled=True)
        meta, rows = P.normalise(p, [{"id": "1", "title": "T", "company": None, "url": "u"}])
        self.assertEqual((meta["count"], len(rows)), (1, 1))

    def test_non_json_object_is_a_portal_error(self):
        p = P.Portal(name="x-search", dir=Path("."), cli=Path("cli.ts"), enabled=True)
        for raw in (None, "text", 42):
            with self.assertRaises(P.PortalError):
                P.normalise(p, raw)


class RateLimitTests(unittest.TestCase):
    def test_second_call_waits_min_interval(self):
        p = P.Portal(name="slow-search", dir=Path("."), cli=Path("cli.ts"), enabled=True, min_interval_s=0.2)
        calls: list[float] = []

        async def fake_exec(*a, **k):
            calls.append(asyncio.get_event_loop().time())

            class Proc:
                returncode = 0

                async def communicate(self):
                    return b'{"results": []}', b""

                def kill(self):
                    pass
            return Proc()

        async def go():
            with mock.patch.object(asyncio, "create_subprocess_exec", fake_exec):
                await P.run_cli(p, ["search"])
                await P.run_cli(p, ["search"])
        asyncio.run(go())
        self.assertGreaterEqual(calls[1] - calls[0], 0.19)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"JOB_ENGINE_TOKEN": "s3cret", "JOB_ENGINE_DEV": "0"})
        self.env.start()
        self.portals = {
            "ok-search": P.Portal(name="ok-search", dir=Path("."), cli=Path("cli.ts"), enabled=True, min_interval_s=0),
            "off-search": P.Portal(name="off-search", dir=Path("."), cli=Path("cli.ts"), enabled=False, min_interval_s=0),
            "bad-search": P.Portal(name="bad-search", dir=Path("."), cli=Path("cli.ts"), enabled=True, min_interval_s=0),
        }
        self.pp = mock.patch.object(app_module, "_PORTALS", self.portals)
        self.pp.start()

        async def fake_run(portal, args, timeout=60):
            if portal.name == "bad-search":
                raise P.PortalError(portal.name, "SEARCH_FAILED", "boom")
            if args[0] == "detail":
                return {"id": args[1], "title": "Detail", "description": "..."}
            return {"meta": {"page": 1}, "results": [
                {"id": "1", "title": "Nurse", "company": "NHS", "location": "Leeds", "date": "2026-09-01", "url": "https://x/1"},
                {"id": "2", "title": "Nurse", "company": "NHS", "location": "Leeds", "date": "2026-09-01", "url": "https://x/1"},
                {"id": "3", "title": "Nurse", "company": "NHS", "location": "York", "date": "2026-09-01", "url": "https://x/3"},
            ]}
        self.rr = mock.patch.object(P, "run_cli", fake_run)
        self.rr.start()
        self.c = TestClient(app_module.app)
        self.h = {"X-Engine-Token": "s3cret"}

    def tearDown(self):
        self.rr.stop(); self.pp.stop(); self.env.stop()

    def test_token_required(self):
        self.assertEqual(self.c.get("/portals").status_code, 401)
        self.assertEqual(self.c.get("/portals", headers={"X-Engine-Token": "nope"}).status_code, 401)
        self.assertEqual(self.c.get("/portals", headers=self.h).status_code, 200)
        self.assertEqual(self.c.get("/health").status_code, 200)   # liveness is open

    def test_search_and_dedupe(self):
        r = self.c.post("/search", json={"portal": "ok-search", "query": "nurse"}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["meta"]["count"], 3)
        self.assertEqual(body["results"][0]["portal"], "ok-search")
        r = self.c.post("/search/multi", json={"portals": ["ok-search", "bad-search", "off-search", "nope-search"], "query": "nurse"},
                        headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        # same posting (portal+url) twice → one row; a same-titled posting in another city stays
        self.assertEqual(len(body["results"]), 2)
        self.assertEqual(body["meta"], {"count": 2, "deduped": 1})
        errs = {p["portal"]: p.get("error") for p in body["portals"]}
        self.assertIsNone(errs["ok-search"])
        self.assertEqual(errs["bad-search"]["code"], "SEARCH_FAILED")
        self.assertEqual(errs["off-search"]["code"], "DISABLED")      # reported, never fatal
        self.assertEqual(errs["nope-search"]["code"], "UNKNOWN_PORTAL")
        # a leading-dash query is a 422 with the reason, not a 502
        r = self.c.post("/search", json={"portal": "ok-search", "query": "--help"}, headers=self.h)
        self.assertEqual(r.status_code, 422, r.text)

    def test_validation(self):
        self.assertEqual(self.c.post("/search", json={"portal": "nope", "query": "x"}, headers=self.h).status_code, 404)
        self.assertEqual(self.c.post("/search", json={"portal": "off-search", "query": "x"}, headers=self.h).status_code, 409)
        self.assertEqual(self.c.post("/search", json={"portal": "ok-search", "jobage": 3}, headers=self.h).status_code, 422)
        self.assertEqual(self.c.post("/search", json={"portal": "ok-search", "limit": 500}, headers=self.h).status_code, 422)
        self.assertEqual(self.c.post("/search", json={"portal": "bad-search", "query": "x"}, headers=self.h).status_code, 502)

    def test_detail(self):
        r = self.c.get("/detail", params={"portal": "ok-search", "id": "42"}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["portal"], "ok-search")
        self.assertEqual(self.c.get("/detail", params={"portal": "ok-search", "id": "--x"}, headers=self.h).status_code, 422)


if __name__ == "__main__":
    unittest.main()
