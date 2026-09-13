---
name: careerjet-search
version: 1.0.0
description: >
  Search Careerjet's partner API across 62 countries (including Pakistan, the Gulf, Bangladesh, the Philippines, Vietnam). Needs a free Careerjet publisher key (CAREERJET_API_KEY); the end user's IP and user agent must be passed.
context: fork
enabled: true
title: "Careerjet (62 countries)"
countries: ["AE", "AR", "AT", "AU", "BD", "BE", "BO", "BR", "CA", "CH", "CL", "CN", "CO", "CR", "CZ", "DE", "DK", "DO", "EC", "ES", "FI", "FR", "GB", "GT", "HK", "HU", "IE", "IN", "IT", "JP", "KR", "KW", "LU", "MA", "MX", "MY", "NL", "NO", "NZ", "OM", "PA", "PE", "PH", "PK", "PL", "PR", "PT", "PY", "QA", "RU", "SA", "SE", "SG", "SK", "TR", "TW", "UA", "US", "UY", "VE", "VN", "ZA"]
official: false
requires_env: [CAREERJET_API_KEY]
sponsor_signal: none
allowed-tools: Bash(bun run .agents/skills/careerjet-search/cli/src/cli.ts *)
---

# Careerjet (62 countries)

Search Careerjet's partner API across 62 countries (including Pakistan, the Gulf, Bangladesh, the Philippines, Vietnam). Needs a free Careerjet publisher key (CAREERJET_API_KEY); the end user's IP and user agent must be passed.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/careerjet-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/careerjet-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/careerjet-search/cli && bun test` (offline fixtures).
