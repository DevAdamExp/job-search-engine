---
name: mycareersfuture-sg-search
version: 1.0.0
description: >
  Search Singapore's official MyCareersFuture job portal (Ministry of Manpower / WSG) through its public JSON API. No key.
context: fork
enabled: true
title: "MyCareersFuture (Singapore, official)"
countries: ["SG"]
official: true
requires_env: []
sponsor_signal: none (Employment Pass is applied per hire; postings rarely state it)
allowed-tools: Bash(bun run .agents/skills/mycareersfuture-sg-search/cli/src/cli.ts *)
---

# MyCareersFuture (Singapore, official)

Search Singapore's official MyCareersFuture job portal (Ministry of Manpower / WSG) through its public JSON API. No key.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/mycareersfuture-sg-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/mycareersfuture-sg-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/mycareersfuture-sg-search/cli && bun test` (offline fixtures).
