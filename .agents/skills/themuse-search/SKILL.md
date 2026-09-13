---
name: themuse-search
version: 1.0.0
description: >
  Search The Muse's public job API by location ("City, Country") with client-side keyword filtering. No key (500 requests/hour). Only the countries whose name the CLI knows are claimed — anything else would return worldwide rows badged as local.
context: fork
enabled: true
title: "The Muse (41 countries, US-heavy)"
countries: ["AE", "AT", "AU", "BD", "BE", "BR", "CA", "CH", "CN", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "IE", "IN", "IT", "JP", "KR", "KW", "LU", "MX", "MY", "NL", "NO", "NZ", "OM", "PH", "PK", "PL", "PT", "QA", "SA", "SE", "SG", "TR", "US", "ZA"]
official: false
requires_env: []
sponsor_signal: none
attribution: "via The Muse"
allowed-tools: Bash(bun run .agents/skills/themuse-search/cli/src/cli.ts *)
---

# The Muse (41 countries, US-heavy)

Search The Muse's public job API by location ("City, Country") with client-side keyword filtering. No key (500 requests/hour). Only the countries whose name the CLI knows are claimed — anything else would return worldwide rows badged as local.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/themuse-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/themuse-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/themuse-search/cli && bun test` (offline fixtures).
