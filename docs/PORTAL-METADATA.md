# Portal metadata (SKILL.md frontmatter)

Every portal under `.agents/skills/<name>/` declares, in its `SKILL.md` frontmatter, what it
covers. The service reads these keys (`service/portals.py::discover`) and the CRM uses them to
pick boards per country automatically.

| key | type | meaning |
|---|---|---|
| `enabled` | bool | ship the portal switched on (default true) |
| `title` | text | human label shown in the CRM, e.g. `Job Bank (Canada, official)` (default: the name without `-search`) |
| `countries` | list of ISO-3166 alpha-2 codes, or `"*"` | which countries the board serves; `"*"` = worldwide aggregator |
| `official` | bool | a government / public-employment-service board (shown first, trusted for expiry and deadlines) |
| `requires_env` | list of env var names | API keys the CLI reads from the environment; when any is unset the service reports the portal `enabled: false` with `disabled_reason: missing_env:<VAR>` |
| `attribution` | text | shown beside every row from this board where the board's terms require it (Adzuna: "Jobs by Adzuna") |
| `fallback` | bool | low-quota board; the CRM only uses it for a country no other board covers (JSearch: 200 requests/month) |
| `sponsor_signal` | text | how a posting on this board reveals visa sponsorship (a flag, a field, or "none") |

Example:

```yaml
---
name: jobbank-ca-search
version: 1.0.0
enabled: true
countries: [CA]
official: true
sponsor_signal: LMIA requested/approved flag on the posting
---
```

`GET /portals?country=CA` returns the boards covering Canada, official first, then worldwide
aggregators. A missing `countries` key means the portal covers nothing by country and is only
reachable by naming it explicitly.
