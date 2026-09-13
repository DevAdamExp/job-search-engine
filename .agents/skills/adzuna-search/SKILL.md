---
name: adzuna-search
version: 1.0.0
description: >
  Search Adzuna's job API in 19 countries. Needs a free Adzuna developer key (ADZUNA_APP_ID / ADZUNA_APP_KEY). Every displayed result must carry the "Jobs by Adzuna" attribution.
context: fork
enabled: true
title: "Adzuna (19 countries)"
countries: ["GB", "US", "AT", "AU", "BE", "BR", "CA", "CH", "DE", "ES", "FR", "IN", "IT", "MX", "NL", "NZ", "PL", "SG", "ZA"]
official: false
requires_env: [ADZUNA_APP_ID, ADZUNA_APP_KEY]
sponsor_signal: none
attribution: "Jobs by Adzuna"
allowed-tools: Bash(bun run .agents/skills/adzuna-search/cli/src/cli.ts *)
---

# Adzuna (19 countries)

Search Adzuna's job API in 19 countries. Needs a free Adzuna developer key (ADZUNA_APP_ID / ADZUNA_APP_KEY). Every displayed result must carry the "Jobs by Adzuna" attribution.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/adzuna-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/adzuna-search/cli && bun test` (offline fixtures).
