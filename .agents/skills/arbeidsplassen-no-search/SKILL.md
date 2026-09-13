---
name: arbeidsplassen-no-search
version: 1.0.0
description: >
  Search Norway's official Arbeidsplassen job board (NAV) through the JSON search API its site uses. No key.
context: fork
enabled: true
title: "Arbeidsplassen (Norway, official)"
countries: ["NO"]
official: true
requires_env: []
sponsor_signal: none (skilled-worker permits are employer-sponsored per hire)
allowed-tools: Bash(bun run .agents/skills/arbeidsplassen-no-search/cli/src/cli.ts *)
---

# Arbeidsplassen (Norway, official)

Search Norway's official Arbeidsplassen job board (NAV) through the JSON search API its site uses. No key.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/arbeidsplassen-no-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/arbeidsplassen-no-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/arbeidsplassen-no-search/cli && bun test` (offline fixtures).
