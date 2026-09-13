---
name: jobicy-search
version: 1.0.0
description: >
  Search Jobicy's remote-jobs API by tag and region. No key; credit + link back required; poll at most hourly.
context: fork
enabled: true
title: "Jobicy (remote, 48 regions)"
countries: ["AE", "AR", "AT", "AU", "BD", "BE", "BH", "BR", "CA", "CH", "CL", "CO", "CZ", "DE", "DK", "EG", "ES", "FI", "FR", "GB", "HK", "ID", "IE", "IN", "IT", "JP", "KR", "KW", "MX", "MY", "NL", "NO", "OM", "PE", "PH", "PK", "PL", "PT", "QA", "SA", "SE", "SG", "TH", "TR", "TW", "US", "VN", "ZA"]
official: false
requires_env: []
sponsor_signal: none (remote roles by region)
attribution: "via Jobicy"
allowed-tools: Bash(bun run .agents/skills/jobicy-search/cli/src/cli.ts *)
---

# Jobicy (remote, 48 regions)

Search Jobicy's remote-jobs API by tag and region. No key; credit + link back required; poll at most hourly.

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/jobicy-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/jobicy-search/cli && bun test` (offline fixtures).
