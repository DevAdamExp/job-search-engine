// Arbeitnow — a free hourly job feed (German-, UK-, French- and Australian-heavy). No key.
// GET https://www.arbeitnow.com/api/job-board-api?page=N (250 rows/page, newest first). The feed has no
// keyword or location parameter, so both are matched client-side over a few pages.
import { CliError, cleanHtml, fetchJson, isoDate, matchesQuery, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "arbeitnow-search"
export const SUMMARY = "Arbeitnow job feed (DE / GB / FR / AU; no key)"
export const NOTES = `Scans up to 4 feed pages (1,000 newest jobs) per search and keeps rows whose title, tags or
description contain every keyword and whose location mentions --location or --country. The board's
visa_sponsorship filter is exposed as --visa-sponsorship but its answer cannot be verified (the field
never appears in rows), so treat it as a hint, never a fact. Terms: link back to arbeitnow.com.`
export const EXTRA_FLAGS: Record<string, string> = { "visa-sponsorship": "true — ask the feed for its (unverifiable) visa-sponsorship subset" }

const BASE = (process.env.ARBEITNOW_API_URL ?? "").trim().replace(/\/+$/, "") || "https://www.arbeitnow.com"
const SCAN_PAGES = 4

const COUNTRY_WORDS: Record<string, string[]> = {
  DE: ["deutschland", "germany", "berlin", "münchen", "munich", "hamburg", "frankfurt", "köln", "cologne", "stuttgart", "düsseldorf", "leipzig", "dresden", "hannover", "nürnberg", "bremen"],
  GB: ["united kingdom", "uk", "england", "scotland", "wales", "london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "bristol", "liverpool", "cambridge", "oxford"],
  FR: ["france", "paris", "lyon", "marseille", "toulouse", "nantes", "bordeaux", "lille", "nice"],
  AU: ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"],
  AT: ["österreich", "austria", "wien", "vienna", "graz", "linz", "salzburg"],
  CH: ["schweiz", "switzerland", "zürich", "zurich", "genève", "geneva", "basel", "bern", "lausanne"],
}

interface Job {
  slug: string
  company_name?: string | null
  title?: string
  description?: string | null
  remote?: boolean
  url?: string
  tags?: string[]
  job_types?: string[]
  location?: string | null
  created_at?: number
}
interface Body { data?: Job[]; links?: { next?: string | null }; meta?: { per_page?: number } }

export function toRow(j: Job): Row {
  return {
    id: j.slug,
    title: j.title || "(untitled)",
    company: j.company_name || null,
    location: j.location || (j.remote ? "Remote" : null),
    date: isoDate(j.created_at),
    url: j.url || `https://www.arbeitnow.com/jobs/${j.slug}`,
    remote: j.remote ?? null,
    tags: j.tags ?? [],
    job_types: j.job_types ?? [],
  }
}

function placeMatches(loc: string | null, o: SearchOpts): boolean {
  const hay = (loc ?? "").toLowerCase()
  if (o.location && !hay.includes(o.location.toLowerCase())) return false
  if (o.country) {
    const words = COUNTRY_WORDS[o.country]
    if (!words) return false
    if (!words.some((w) => hay.includes(w))) return false
  }
  return true
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const rows = (body?.data ?? [])
    .filter((j) => matchesQuery(o.query, j.title, (j.tags ?? []).join(" "), cleanHtml(j.description)))
    .filter((j) => placeMatches(j.location ?? null, o))
    .map(toRow)
    .filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: null, has_more: Boolean(body?.links?.next) }, results: rows }
}

export function validate(o: SearchOpts): string | null {
  if (!o.query && !o.location && !o.country) return "give --query, --location or --country (the feed cannot be listed whole)"
  if (o.extra["visa-sponsorship"] && o.extra["visa-sponsorship"] !== "true") return "--visa-sponsorship takes only true"
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const results: Row[] = []
  let hasMore = false
  const first = (o.page - 1) * SCAN_PAGES + 1
  for (let i = 0; i < SCAN_PAGES; i++) {
    const p = new URLSearchParams({ page: String(first + i) })
    if (o.extra["visa-sponsorship"]) p.set("visa_sponsorship", "true")
    const { body } = await fetchJson<Body>(`${BASE}/api/job-board-api?${p}`)
    const part = mapSearch(body, o)
    results.push(...part.results)
    hasMore = Boolean(part.meta.has_more)
    if (!hasMore || results.length >= o.limit) break
  }
  return { meta: { page: o.page, limit: o.limit, total: null, has_more: hasMore, scanned_pages: SCAN_PAGES }, results: results.slice(0, o.limit) }
}

export function normalizeId(input: string): string | null {
  const t = input.trim()
  const m = t.match(/\/jobs\/(?:companies\/[^/]+\/)?([^/?#]+)/)
  if (m) return m[1]
  return /^[a-z0-9][a-z0-9-]*$/i.test(t) ? t : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const slug = normalizeId(input)
  if (!slug) throw new CliError(`could not parse an Arbeitnow slug from "${input}"`, "BAD_ID")
  // No detail endpoint: walk the newest pages for the slug (feed rows already carry the full description).
  for (let page = 1; page <= SCAN_PAGES; page++) {
    const { body } = await fetchJson<Body>(`${BASE}/api/job-board-api?page=${page}`)
    const job = (body?.data ?? []).find((j) => j.slug === slug)
    if (job) return { ...toRow(job), description: cleanHtml(job.description) }
    if (!body?.links?.next) break
  }
  return null
}
