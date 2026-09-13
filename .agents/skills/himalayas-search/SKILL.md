---
name: himalayas-search
version: 1.0.0
description: >
  Search Himalayas' remote-job feed worldwide, filtered by the country a candidate may work from. No key; link back required.
context: fork
enabled: true
title: "Himalayas (remote, worldwide)"
countries: "*"
official: false
requires_env: []
sponsor_signal: none (remote roles; locationRestrictions says which countries may apply)
attribution: "via Himalayas"
allowed-tools: Bash(bun run .agents/skills/himalayas-search/cli/src/cli.ts *)
---

# Himalayas (remote, worldwide)

Search Himalayas' remote-job feed worldwide, filtered by the country a candidate may work from. No key; link back required.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/himalayas-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/himalayas-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/himalayas-search/cli && bun test` (offline fixtures).
