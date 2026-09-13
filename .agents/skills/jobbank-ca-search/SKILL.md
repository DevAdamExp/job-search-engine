---
name: jobbank-ca-search
version: 1.0.0
description: >
  Use this skill to search Canada's official Job Bank (jobbank.gc.ca, the Government of
  Canada job board) for job postings in any Canadian city or province, including postings
  where the employer has requested or holds an approved LMIA (Labour Market Impact
  Assessment — i.e. is hiring temporary foreign workers). Trigger phrases: Canada jobs,
  Job Bank, LMIA jobs, emploi Canada, Guichet-Emplois, jobs in Toronto / Vancouver /
  Calgary / Montréal, foreign worker jobs Canada, look up this Job Bank posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts *)
---

# Job Bank (Canada) Search Skill

Search live postings on **Job Bank**, the Government of Canada's official job board —
public pages, no authentication, no API key, **zero runtime dependencies** (just `bun`).
Every posting carries a NOC 2021 code, and the board exposes an **LMIA facet**: employers
who have *requested* or *hold an approved* Labour Market Impact Assessment, which is the
official signal that a posting is open to foreign workers.

## Access rules

`https://www.jobbank.gc.ca/robots.txt` allows crawling with **`Crawl-delay: 5`**. Keep at
least five seconds between requests (the job-search-engine service enforces this for you;
by hand, keep volume low). Public government data; no terms forbid automated reading.

## Commands

### Search job listings

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search [--query "<text>"] [--location "<City, PR>"] [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords (job title, skill). Optional but recommended.
- `--location <text>` / `-l <text>` — a Job Bank place string, e.g. `"Toronto, ON"`, `"Calgary, AB"`, `"Québec, QC"`. Optional (empty = all of Canada).
- `--jobage <days>` — posted within N days: `1`, `7`, `14`, `30`. Job Bank filters at 2 / 30 days; the CLI narrows further by each card's posting date.
- `--lmia <mode>` — `requested` | `approved` | `any` (default). **This is the foreign-worker facet.**
- `--noc <code>` — restrict to one NOC 2021 code, e.g. `31301` (registered nurses), `63200` (cooks).
- `--page <n>` — 1-indexed page (25 results per page).
- `--limit <n>` / `-n <n>` — cap results emitted (client-side).
- `--format json|table|plain` — default `json`.

At least one of `--query`, `--location`, `--noc` is required.

### Fetch full posting detail

```bash
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the posting id from `search` (e.g. `50241782`); a full posting URL also works. Returns
title, employer, location, posted date, apply-by date, salary (min/max, currency, unit, hours),
terms of employment, NOC code, vacancies, LMIA status, the description and `isActive`.

## Usage examples

```bash
# Cooks anywhere in Canada whose employer has requested an LMIA
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "cook" --lmia requested --format table

# Software developers in Toronto posted this week
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search -q "software developer" -l "Toronto, ON" --jobage 7 --format table

# Registered nurses (NOC 31301) with an approved LMIA
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts search --noc 31301 --lmia approved --limit 10

# One posting in full
bun run .agents/skills/jobbank-ca-search/cli/src/cli.ts detail 50241782 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; `meta.total` is the board's own result count |
| `table` | Quick scanning (id, title, company, location, LMIA, date) |
| `plain` | Reading a single posting (`detail`) |

Search results add `salary`, `lmia` (`requested` / `approved` / `null`), `workplace` (On site /
Remote / Hybrid) and `jobNumber` to the contract fields. Errors go to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- The search page is server-rendered HTML (one `<article id="article-<id>">` per posting); a
  posting page is schema.org RDFa. Anchors are documented in `url-reference.md`.
- The board's Atom feed exists but returns 404 for most parameter combinations, so the CLI
  reads the HTML results page instead.
- `isActive` is derived from the posting's apply-by date and expiry banner; absence of a banner
  is not proof the posting is open.
