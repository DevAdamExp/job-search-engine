#!/usr/bin/env bun
// Generated scaffold (scratchpad/gen_portals.py): flag parsing, validation and output for the
// portal contract; the board-specific work lives in ./source.ts.
import { CliError, renderPlain, renderTable, writeError, type SearchOpts } from "./lib.js"
import * as source from "./source.js"

interface Flags { _: string[]; [k: string]: string | boolean | string[] }
const ALIAS: Record<string, string> = { q: "query", l: "location", n: "limit" }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("-")) { ;(flags._ as string[]).push(a); continue }
    const key = ALIAS[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("-")) flags[key] = true
    else { flags[key] = next; i++ }
  }
  return flags
}

const COMMON = ["query", "location", "country", "jobage", "page", "limit", "format", "help", "h"]
const KNOWN: Record<string, Set<string>> = {
  search: new Set([...COMMON, ...Object.keys(source.EXTRA_FLAGS)]),
  detail: new Set(["format", "help", "h"]),
}

const HELP = `${source.NAME} — ${source.SUMMARY}

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [-l "<city>"] [--country XX] [--jobage 1|7|14|30] [--page N] [--limit N] [--format json|table|plain]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, role).
  --location, -l <text>   City / region (free text; boards that lack a location filter fold it into the keywords).
  --country <XX>          ISO-3166 alpha-2 country (worldwide boards only).
  --jobage <days>         Posted within 1, 7, 14 or 30 days (client-side where the board has no filter).
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page. Default 20.
  --format <fmt>          json (default) | table | plain.
${Object.entries(source.EXTRA_FLAGS).map(([k, v]) => `  --${k.padEnd(21)} ${v}`).join("\n")}

${source.NOTES}
`

function bad(message: string, code = "BAD_ARGS"): number { writeError(message, code); return 1 }

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]
  if (!cmd || flags.help || flags.h) { process.stdout.write(HELP); return cmd ? 0 : 1 }
  if (cmd !== "search" && cmd !== "detail") return bad(`Unknown command "${cmd}". Use search or detail.`)
  for (const k of Object.keys(flags)) if (k !== "_" && !KNOWN[cmd].has(k)) return bad(`Unknown flag --${k} for ${cmd}`, "UNKNOWN_FLAG")
  const format = String(flags.format ?? "json")

  if (cmd === "search") {
    if (!["json", "table", "plain"].includes(format)) return bad("--format must be json, table or plain")
    const num = (name: string, dflt: number, min: number): number | null => {
      if (flags[name] === undefined) return dflt
      const v = Number(String(flags[name]).trim())
      if (!Number.isInteger(v) || v < min) { bad(`--${name} must be a whole number ≥ ${min}`, "BAD_ARG"); return null }
      return v
    }
    const page = num("page", 1, 1); if (page === null) return 1
    const limit = num("limit", 20, 1); if (limit === null) return 1
    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      jobage = Number(String(flags.jobage))
      if (![1, 7, 14, 30].includes(jobage)) return bad("--jobage must be 1, 7, 14 or 30", "BAD_ARG")
    }
    const str = (k: string) => (typeof flags[k] === "string" ? String(flags[k]).trim() : undefined) || undefined
    const country = str("country")?.toUpperCase()
    if (country && !/^[A-Z]{2}$/.test(country)) return bad("--country must be an ISO-3166 alpha-2 code", "BAD_ARG")
    const extra: Record<string, string> = {}
    for (const k of Object.keys(source.EXTRA_FLAGS)) { const v = str(k); if (v) extra[k] = v }
    const opts: SearchOpts = { query: str("query"), location: str("location"), country, jobage, page, limit, extra }
    const err = source.validate?.(opts)
    if (err) return bad(err, "BAD_ARG")
    try {
      const out = await source.search(opts)
      if (format === "json") process.stdout.write(JSON.stringify(out) + "\n")
      else if (format === "table") process.stdout.write(renderTable(out.results) + "\n")
      else process.stdout.write(renderPlain(out.results) + "\n")
      return 0
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e), e instanceof CliError ? e.code : "SEARCH_FAILED")
      return 1
    }
  }

  const id = (flags._ as string[])[1]
  if (!id) return bad("detail needs a posting id or URL")
  if (!["json", "plain"].includes(format)) return bad("--format must be json or plain")
  try {
    const job = await source.detail(id)
    if (!job) { writeError("job not found", "NOT_FOUND"); return 1 }
    if (format === "json") process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    else process.stdout.write([job.title, `${job.company ?? "—"} · ${job.location ?? "—"}`, job.date ? `Posted: ${job.date}` : "", "", String(job.description ?? "(no description)"), "", `URL: ${job.url}`].filter((l) => l !== "").join("\n") + "\n")
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof CliError ? e.code : "DETAIL_FAILED")
    return 1
  }
}

main().then((c) => process.exit(c)).catch((e) => { writeError(e instanceof Error ? e.message : String(e), "UNHANDLED"); process.exit(1) })
