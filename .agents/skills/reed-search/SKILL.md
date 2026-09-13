---
name: reed-search
version: 1.0.0
description: >
  Search Reed.co.uk's jobseeker API (UK). Needs a free Reed API key (REED_API_KEY).
context: fork
enabled: true
title: "Reed (United Kingdom)"
countries: ["GB"]
official: false
requires_env: [REED_API_KEY]
sponsor_signal: none
allowed-tools: Bash(bun run .agents/skills/reed-search/cli/src/cli.ts *)
---

# Reed (United Kingdom)

Search Reed.co.uk's jobseeker API (UK). Needs a free Reed API key (REED_API_KEY).

Built on the repo's portal-skill contract (`search` / `detail`, JSON `{meta, results[id,title,company,location,date,url]}`,
errors on stderr as `{"error","code"}`), as a zero-dependency Bun CLI. The engine service picks it
by country from the frontmatter above (see `docs/PORTAL-METADATA.md`).

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "nurse" --limit 10 --format table
bun run .agents/skills/reed-search/cli/src/cli.ts detail <id|url> --format plain
```

Run `--help` for the board-specific flags. Tests: `cd .agents/skills/reed-search/cli && bun test` (offline fixtures).
