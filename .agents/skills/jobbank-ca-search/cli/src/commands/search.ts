import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  parseTotal,
  jobageToFage,
  lmiaToFskl,
  writeError,
  type JobCard,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  lmia?: string // requested | approved | any
  noc?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  params.set("searchstring", opts.query || "")
  params.set("locationstring", opts.location || "")
  params.set("sort", "D") // newest first
  if (opts.page > 1) params.set("page", String(opts.page))
  const fage = jobageToFage(opts.jobage)
  if (fage) params.set("fage", fage)
  const fskl = lmiaToFskl(opts.lmia)
  if (fskl) params.set("fskl", fskl)
  if (opts.noc) params.set("fn21", opts.noc)
  return `${SEARCH_URL}?${params.toString()}`
}

function cutoff(days: number | undefined): string | null {
  if (!days || days <= 0) return null
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 38).padEnd(38)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 22).padEnd(22)
    const lmia = (c.lmia || "—").padEnd(9)
    return `${c.id.padEnd(9)} ${title} ${company} ${loc} ${lmia} ${c.date || "—"}`
  })
  const header = "ID".padEnd(9) + " " + "TITLE".padEnd(38) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(22) + " " + "LMIA".padEnd(9) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)
    const since = cutoff(opts.jobage)
    if (since) cards = cards.filter((c) => !c.date || c.date >= since)
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)
    const total = parseTotal(html)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}${c.lmia ? ` · LMIA ${c.lmia}` : ""}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page, total }, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
