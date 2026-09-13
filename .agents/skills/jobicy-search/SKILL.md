---
name: jobicy-search
version: 1.0.0
description: >
  Search Jobicy's remote-jobs API by tag and region. No key; credit + link back required; poll at most hourly.
context: fork
enabled: true
title: "Jobicy (remote, worldwide)"
countries: "*"
official: false
requires_env: []
sponsor_signal: none (remote roles by region)
allowed-tools: Bash(bun run .agents/skills/jobicy-search/cli/src/cli.ts *)
---

# Jobicy (remote, worldwide)

Search Jobicy's remote-jobs API by tag and region. No key; credit + link back required; poll at most hourly.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/jobicy-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/jobicy-search/cli && bun test` (offline fixtures).
