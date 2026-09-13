#!/usr/bin/env bun
// Self-contained CLI for Canada's official Job Bank (www.jobbank.gc.ca), the Government of
// Canada job board — including its LMIA facet (employers who requested / hold an approved
// Labour Market Impact Assessment, i.e. are hiring foreign workers). Public pages, no
// authentication, zero runtime dependencies. Honour robots.txt's Crawl-delay: 5.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jobbank-ca-cli — search Canada's official Job Bank (jobbank.gc.ca), incl. the LMIA facet

USAGE
  bun run src/cli.ts search [--query "<text>"] [--location "<City, PR>"] [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill). Optional but recommended.
  --location, -l <text>   Job Bank place string, e.g. "Toronto, ON", "Calgary, AB", "Québec, QC".
  --jobage <days>         Posted within N days: 1, 7, 14, 30 (Job Bank filters at 2/30 days; the
                          CLI narrows further by the card's own posting date).
  --lmia <mode>           requested | approved | any (default any). "requested" = the employer has
                          applied for an LMIA to hire a temporary foreign worker; "approved" = holds one.
  --noc <code>            Restrict to a NOC 2021 code (e.g. 21232).
  --page <n>              1-indexed page (25 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "cook" --lmia requested --format table
  bun run src/cli.ts search -q "software developer" -l "Toronto, ON" --jobage 7 --format table
  bun run src/cli.ts search --noc 31301 --lmia approved --limit 10
  bun run src/cli.ts detail 50241782 --format plain

Public government site; respect its Crawl-delay of 5 seconds between requests.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "jobage", "lmia", "noc", "page", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function bad(message: string, code = "BAD_ARGS"): number {
  process.stderr.write(JSON.stringify({ error: message, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }
  if (cmd !== "search" && cmd !== "detail") return bad(`Unknown command "${cmd}". Use search or detail.`)

  for (const k of Object.keys(flags)) {
    if (k !== "_" && !KNOWN_FLAGS[cmd].has(k)) return bad(`Unknown flag --${k} for ${cmd}`)
  }
  const format = String(flags.format ?? "json")

  if (cmd === "search") {
    if (!["json", "table", "plain"].includes(format)) return bad("--format must be json, table or plain")
    const jobage = flags.jobage !== undefined ? Number(flags.jobage) : undefined
    if (jobage !== undefined && ![1, 7, 14, 30].includes(jobage)) return bad("--jobage must be 1, 7, 14 or 30")
    const page = flags.page !== undefined ? Number(flags.page) : 1
    if (!Number.isInteger(page) || page < 1) return bad("--page must be a positive integer")
    const limit = flags.limit !== undefined ? Number(flags.limit) : undefined
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) return bad("--limit must be a non-negative integer")
    const lmia = flags.lmia !== undefined ? String(flags.lmia) : "any"
    if (!["requested", "approved", "any"].includes(lmia)) return bad("--lmia must be requested, approved or any")
    const noc = flags.noc !== undefined ? String(flags.noc) : undefined
    if (noc !== undefined && !/^\d{4,5}$/.test(noc)) return bad("--noc must be a 4–5 digit NOC 2021 code")
    const query = typeof flags.query === "string" ? flags.query : undefined
    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!query && !location && !noc) return bad("Give --query, --location or --noc")
    const opts: SearchOpts = { query, location, jobage, lmia, noc, page, limit, format: format as SearchOpts["format"] }
    return runSearch(opts)
  }

  const id = (flags._ as string[])[1]
  if (!id) return bad("detail needs a posting id or URL")
  if (!["json", "plain"].includes(format)) return bad("--format must be json or plain")
  const opts: DetailOpts = { id, format: format as DetailOpts["format"] }
  return runDetail(opts)
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "UNHANDLED" }) + "\n")
    process.exit(1)
  })
