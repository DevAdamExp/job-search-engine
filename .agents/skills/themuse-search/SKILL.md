---
name: themuse-search
version: 1.0.0
description: >
  Search The Muse's public job API by location ("City, Country") with client-side keyword filtering. No key (500 requests/hour).
context: fork
enabled: true
title: "The Muse (worldwide, US-heavy)"
countries: "*"
official: false
requires_env: []
sponsor_signal: none
allowed-tools: Bash(bun run .agents/skills/themuse-search/cli/src/cli.ts *)
---

# The Muse (worldwide, US-heavy)

Search The Muse's public job API by location ("City, Country") with client-side keyword filtering. No key (500 requests/hour).

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/themuse-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/themuse-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/themuse-search/cli && bun test` (offline fixtures).
