// Jobicy — remote jobs API. No key; credit + link back required; poll at most hourly.
// GET https://jobicy.com/api/v2/remote-jobs?count=&geo=&industry=&tag=
import { CliError, cleanHtml, fetchJson, isoDate, matchesQuery, money, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "jobicy-search"
export const SUMMARY = "Jobicy remote jobs by region (no key)"
export const NOTES = `--country XX maps to Jobicy's region slug (uk, usa, canada, germany, france, spain, netherlands,
australia, singapore …; others fall back to the continent: europe, apac, emea, latam). --location is
ignored (remote roles). The API returns one batch (--limit ≤ 50), so --page is always 1.`
export const EXTRA_FLAGS: Record<string, string> = { industry: "Jobicy industry slug, e.g. engineering, nursing, marketing" }

const BASE = (process.env.JOBICY_API_URL ?? "").trim().replace(/\/+$/, "") || "https://jobicy.com"

const GEO: Record<string, string> = {
  GB: "uk", US: "usa", CA: "canada", DE: "germany", FR: "france", ES: "spain", NL: "netherlands", AU: "australia", SG: "singapore",
  IE: "ireland", IT: "italy", PT: "portugal", PL: "poland", SE: "sweden", NO: "norway", DK: "denmark", FI: "finland", AT: "austria",
  CH: "switzerland", BE: "belgium", CZ: "czechia", JP: "japan", IN: "india", BR: "brazil", MX: "mexico", AR: "argentina",
  AE: "emea", SA: "emea", QA: "emea", KW: "emea", OM: "emea", BH: "emea", ZA: "emea", EG: "emea", TR: "emea", PK: "apac", BD: "apac",
  PH: "apac", MY: "apac", ID: "apac", VN: "apac", TH: "apac", HK: "apac", TW: "apac", KR: "apac", CL: "latam", CO: "latam", PE: "latam",
}

interface Job {
  id: number
  url?: string
  jobTitle?: string
  companyName?: string | null
  jobGeo?: string | null
  jobLevel?: string | null
  jobType?: string[]
  jobIndustry?: string[]
  pubDate?: string
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  salaryPeriod?: string | null
  jobExcerpt?: string | null
  jobDescription?: string | null
}
interface Body { jobCount?: number; jobs?: Job[] }

export function toRow(j: Job): Row {
  return {
    id: String(j.id),
    title: j.jobTitle || "(untitled)",
    company: j.companyName || null,
    location: j.jobGeo ? `Remote (${j.jobGeo.replace(/\s+/g, " ")})` : "Remote",
    date: isoDate(j.pubDate),
    url: j.url || `https://jobicy.com/jobs/${j.id}`,
    remote: true,
    level: j.jobLevel || null,
    employment_type: (j.jobType ?? []).join(", ") || null,
    industry: (j.jobIndustry ?? []).join(", ") || null,
    salary: money(j.salaryMin ?? null, j.salaryMax ?? null, j.salaryCurrency ?? null, j.salaryPeriod ?? null),
    description: cleanHtml(j.jobDescription) ?? j.jobExcerpt ?? null,
  }
}

export function geoFor(country?: string): string | undefined {
  return country ? GEO[country] : undefined
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const rows = (body?.jobs ?? []).map(toRow)
    .filter((r) => matchesQuery(o.query, r.title, r.industry as string | null))
    .filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: 1, limit: o.limit, total: body?.jobCount ?? null }, results: rows.slice(0, o.limit) }
}

export function validate(o: SearchOpts): string | null {
  if (o.country && !GEO[o.country]) return `Jobicy has no region for ${o.country}; leave --country out for worldwide`
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ count: String(Math.min(Math.max(o.limit * 2, 20), 50)) })
  const geo = geoFor(o.country)
  if (geo) p.set("geo", geo)
  if (o.extra.industry) p.set("industry", o.extra.industry)
  if (o.query) p.set("tag", o.query.split(/\s+/)[0])   // the API's tag is one word; the rest is matched client-side
  const { body } = await fetchJson<Body>(`${BASE}/api/v2/remote-jobs?${p}`)
  return mapSearch(body, o)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/(?:jobs\/)?(\d{3,})/)
  return m ? m[1] : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a Jobicy job id from "${input}"`, "BAD_ID")
  // No detail endpoint; the feed rows already carry the full description.
  const { body } = await fetchJson<Body>(`${BASE}/api/v2/remote-jobs?count=50`)
  const job = (body?.jobs ?? []).find((j) => String(j.id) === id)
  if (!job) return null
  const r = toRow(job)
  return { ...r, description: (r.description as string | null) ?? null }
}
