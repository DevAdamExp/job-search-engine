---
name: jobroom-ch-search
version: 1.0.0
description: >
  Search Switzerland's official job-room.ch board (SECO / public employment service) through its public JSON API. No key.
context: fork
enabled: true
title: "job-room.ch (Switzerland, official)"
countries: ["CH"]
official: true
requires_env: []
sponsor_signal: none (non-EU hires need cantonal approval under quotas)
allowed-tools: Bash(bun run .agents/skills/jobroom-ch-search/cli/src/cli.ts *)
---

# job-room.ch (Switzerland, official)

Search Switzerland's official job-room.ch board (SECO / public employment service) through its public JSON API. No key.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/jobroom-ch-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/jobroom-ch-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/jobroom-ch-search/cli && bun test` (offline fixtures).
