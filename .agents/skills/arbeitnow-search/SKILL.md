---
name: arbeitnow-search
version: 1.0.0
description: >
  Scan Arbeitnow's hourly job feed (German-, UK-, French- and Australian-heavy) with client-side keyword and location filtering. No key.
context: fork
enabled: true
title: "Arbeitnow (Germany, UK, France, Australia)"
countries: ["DE", "GB", "FR", "AU"]
official: false
requires_env: []
sponsor_signal: weak hint only (the board's visa_sponsorship filter exists but the field never arrives)
allowed-tools: Bash(bun run .agents/skills/arbeitnow-search/cli/src/cli.ts *)
---

# Arbeitnow (Germany, UK, France, Australia)

Scan Arbeitnow's hourly job feed (German-, UK-, French- and Australian-heavy) with client-side keyword and location filtering. No key.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/arbeitnow-search/cli && bun test` (offline fixtures).
