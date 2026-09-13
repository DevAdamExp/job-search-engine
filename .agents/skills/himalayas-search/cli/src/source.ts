// Himalayas — remote jobs worldwide, with an explicit list of countries each role may be worked from.
// GET https://himalayas.app/jobs/api/search?q=&country=XX&page=&sort=recent  (no key; link back required).
import { CliError, cleanHtml, fetchJson, isoDate, money, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "himalayas-search"
export const SUMMARY = "Himalayas remote jobs, filtered by the country a candidate may work from (no key)"
export const NOTES = `--country XX keeps roles that accept applicants living in that country (the board's own filter);
--location is ignored (remote roles). Descriptions arrive with the search, so \`detail\` needs no extra call.
Terms: credit Himalayas and link to the posting; never re-submit its jobs to other boards.`
export const EXTRA_FLAGS: Record<string, string> = {}

const BASE = (process.env.HIMALAYAS_API_URL ?? "").trim().replace(/\/+$/, "") || "https://himalayas.app"

interface Job {
  guid?: string
  applicationLink?: string
  title?: string
  companyName?: string | null
  employmentType?: string | null
  minSalary?: number | null
  maxSalary?: number | null
  currency?: string | null
  salaryPeriod?: string | null
  locationRestrictions?: string[]
  timezoneRestrictions?: (string | number)[]
  seniority?: string[]
  categories?: string[]
  pubDate?: number
  expiryDate?: number
  excerpt?: string | null
  description?: string | null
}
interface Body { totalCount?: number; jobs?: Job[] }

export function toRow(j: Job): Row {
  const url = j.applicationLink || j.guid || ""
  const lr = j.locationRestrictions ?? []
  return {
    id: url.replace(/^https?:\/\/himalayas\.app\//, ""),
    title: j.title || "(untitled)",
    company: j.companyName || null,
    location: lr.length === 0 ? "Remote (worldwide)" : lr.length <= 3 ? `Remote (${lr.join(", ")})` : `Remote (${lr.slice(0, 3).join(", ")} +${lr.length - 3})`,
    date: isoDate(j.pubDate),
    url: url,
    deadline: isoDate(j.expiryDate),
    remote: true,
    countries_allowed: lr,
    salary: money(j.minSalary ?? null, j.maxSalary ?? null, j.currency ?? null, j.salaryPeriod ?? null),
    employment_type: j.employmentType || null,
    seniority: (j.seniority ?? []).join(", ") || null,
    description: cleanHtml(j.description) ?? j.excerpt ?? null,
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const rows = (body?.jobs ?? []).map(toRow).filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: body?.totalCount ?? null }, results: rows }
}

export function validate(_o: SearchOpts): string | null {
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ page: String(o.page), sort: "recent" })
  if (o.query) p.set("q", o.query)
  if (o.country) p.set("country", o.country)
  const { body } = await fetchJson<Body>(`${BASE}/jobs/api/search?${p}`)
  const out = mapSearch(body, o)
  out.results = out.results.slice(0, o.limit)
  return out
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const m = input.trim().match(/companies\/([^/]+)\/jobs\/([^/?#]+)/)
  if (!m) throw new CliError(`give a Himalayas posting URL (https://himalayas.app/companies/<company>/jobs/<slug>)`, "BAD_ID")
  // No detail endpoint: find the posting by its slug words in a recent search of that company.
  const { body } = await fetchJson<Body>(`${BASE}/jobs/api/search?${new URLSearchParams({ q: m[2].replace(/-/g, " "), sort: "recent" })}`)
  const job = (body?.jobs ?? []).find((j) => (j.applicationLink || j.guid || "").includes(`/${m[1]}/jobs/${m[2]}`))
  if (!job) return null
  const r = toRow(job)
  return { ...r, description: (r.description as string | null) ?? null }
}
