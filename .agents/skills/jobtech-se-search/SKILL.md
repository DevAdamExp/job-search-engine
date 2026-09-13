---
name: jobtech-se-search
version: 1.0.0
description: >
  Search Sweden's official Platsbanken job board through the JobTech open API (Arbetsförmedlingen). No key. Use for any job in Sweden.
context: fork
enabled: true
title: "Platsbanken (Sweden, official)"
countries: ["SE"]
official: true
requires_env: []
sponsor_signal: none (Sweden has no sponsor register; any employer may sponsor a work permit)
allowed-tools: Bash(bun run .agents/skills/jobtech-se-search/cli/src/cli.ts *)
---

# Platsbanken (Sweden, official)

Search Sweden's official Platsbanken job board through the JobTech open API (Arbetsförmedlingen). No key. Use for any job in Sweden.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/jobtech-se-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/jobtech-se-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/jobtech-se-search/cli && bun test` (offline fixtures).
