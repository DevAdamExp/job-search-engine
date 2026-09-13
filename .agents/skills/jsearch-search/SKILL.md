---
name: jsearch-search
version: 1.0.0
description: >
  Search Google-for-Jobs results through the JSearch API on RapidAPI, worldwide. Needs a RapidAPI key (RAPIDAPI_KEY); the free plan is 200 requests per month, so the CRM only uses it for countries no other board covers.
context: fork
enabled: true
title: "JSearch (Google for Jobs, 40+ countries — fallback)"
countries: "*"
official: false
requires_env: [RAPIDAPI_KEY]
sponsor_signal: none
fallback: true
allowed-tools: Bash(bun run .agents/skills/jsearch-search/cli/src/cli.ts *)
---

# JSearch (Google for Jobs, 40+ countries — fallback)

Search Google-for-Jobs results through the JSearch API on RapidAPI, worldwide. Needs a RapidAPI key (RAPIDAPI_KEY); the free plan is 200 requests per month, so the CRM only uses it for countries no other board covers.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/jsearch-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/jsearch-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/jsearch-search/cli && bun test` (offline fixtures).
