// The Muse — public jobs API. No key (500 requests/hour; a registered key raises it to 3,600).
// GET https://www.themuse.com/api/public/jobs?page=&location=&category=  — no keyword parameter, so
// the query is matched client-side against titles over a few pages. Detail: /api/public/jobs/{id}.
import { CliError, cleanHtml, COUNTRY_NAMES, fetchJson, isoDate, matchesQuery, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "themuse-search"
export const SUMMARY = "The Muse public job API (worldwide, US-heavy; no key)"
export const NOTES = `The API filters by exact location strings ("London, United Kingdom", "Flexible / Remote"), not
by keyword: give --location as "City, Country"; a bare --country XX becomes that country's name and
matches its country-wide postings only. Keywords are matched client-side against titles across up to
4 pages (20 rows each), so a narrow query can return few rows. Terms: link back to The Muse.`
export const EXTRA_FLAGS: Record<string, string> = { category: "The Muse category name, e.g. \"Software Engineering\"" }

const BASE = (process.env.THEMUSE_API_URL ?? "").trim().replace(/\/+$/, "") || "https://www.themuse.com"
const SCAN_PAGES = 4

interface Job {
  id: number
  name?: string
  publication_date?: string
  locations?: { name: string }[]
  levels?: { name: string }[]
  categories?: { name: string }[]
  company?: { name?: string | null } | null
  refs?: { landing_page?: string }
  contents?: string | null
}
interface Body { page?: number; page_count?: number; total?: number; results?: Job[] }

export function toRow(j: Job): Row {
  return {
    id: String(j.id),
    title: j.name || "(untitled)",
    company: j.company?.name || null,
    location: (j.locations ?? []).map((l) => l.name).join(" · ") || null,
    date: isoDate(j.publication_date),
    url: j.refs?.landing_page || `https://www.themuse.com/jobs/${j.id}`,
    level: (j.levels ?? []).map((l) => l.name).join(", ") || null,
    category: (j.categories ?? []).map((c) => c.name).join(", ") || null,
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const countryName = !o.location && o.country ? COUNTRY_NAMES[o.country] : undefined
  const rows = (body?.results ?? []).map(toRow)
    .filter((r) => matchesQuery(o.query, r.title, r.category as string | null))
    // the API's location filter also admits multi-location postings from elsewhere; keep the country's own
    .filter((r) => !countryName || String(r.location ?? "").includes(countryName))
    .filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: body?.total ?? null, api_pages: body?.page_count ?? null }, results: rows }
}

export function validate(o: SearchOpts): string | null {
  if (o.country && !COUNTRY_NAMES[o.country]) return `The Muse CLI has no location name for ${o.country}; it would return worldwide rows`
  if (!o.query && !o.location && !o.country && !o.extra.category) return "give --query, --location, --country or --category"
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const location = o.location || (o.country ? COUNTRY_NAMES[o.country] : undefined)
  const results: Row[] = []
  let total: number | null = null
  // Scan a few API pages per requested page: the API can't filter by keyword, we can.
  const first = (o.page - 1) * SCAN_PAGES
  for (let i = 0; i < SCAN_PAGES; i++) {
    const p = new URLSearchParams({ page: String(first + i) })
    if (location) p.set("location", location)
    if (o.extra.category) p.set("category", o.extra.category)
    const { body } = await fetchJson<Body>(`${BASE}/api/public/jobs?${p}`)
    const part = mapSearch(body, o)
    total = part.meta.total ?? total
    results.push(...part.results)
    if (!body?.results?.length || (body.page_count != null && first + i + 1 >= body.page_count) || results.length >= o.limit) break
  }
  return { meta: { page: o.page, limit: o.limit, total, note: "total counts the location, not the keyword" }, results: results.slice(0, o.limit) }
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/(\d{5,})/)
  return m ? m[1] : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a Muse job id from "${input}" (numeric id, or a URL ending in the id)`, "BAD_ID")
  const { body } = await fetchJson<Job>(`${BASE}/api/public/jobs/${id}`)
  if (!body) return null
  return { ...toRow(body), description: cleanHtml(body.contents) }
}
