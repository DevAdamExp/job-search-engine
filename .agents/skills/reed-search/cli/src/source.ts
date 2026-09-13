// Reed.co.uk — Jobseeker API (UK). Needs a free key (https://www.reed.co.uk/developers/jobseeker):
// HTTP Basic auth, username = key, empty password (REED_API_KEY).
import { CliError, cleanHtml, fetchJson, isoDate, money, requireEnv, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "reed-search"
export const SUMMARY = "Reed.co.uk jobseeker API (United Kingdom; free key required)"
export const NOTES = `UK only. --location is a place name; --distance in miles (default 10). --jobage is applied client-side.
Set REED_API_KEY. Detail returns the full description.`
export const EXTRA_FLAGS: Record<string, string> = {
  distance: "miles around --location (default 10)",
  "salary-min": "minimum annual salary (GBP)",
  "direct-employer": "1 — posted by the employer, not an agency",
}

const BASE = (process.env.REED_API_URL ?? "").trim().replace(/\/+$/, "") || "https://www.reed.co.uk"

interface Job {
  jobId: number
  employerName?: string | null
  jobTitle?: string
  locationName?: string | null
  minimumSalary?: number | null
  maximumSalary?: number | null
  currency?: string | null
  expirationDate?: string
  date?: string
  jobDescription?: string | null
  jobUrl?: string
  applications?: number | null
  contractType?: string | null
  jobType?: string | null
}
interface Body { results?: Job[]; totalResults?: number }

export function toRow(j: Job): Row {
  return {
    id: String(j.jobId),
    title: j.jobTitle || "(untitled)",
    company: j.employerName || null,
    location: j.locationName || null,
    date: isoDate(j.date),
    url: j.jobUrl || `https://www.reed.co.uk/jobs/${j.jobId}`,
    deadline: isoDate(j.expirationDate),
    salary: money(j.minimumSalary ?? null, j.maximumSalary ?? null, j.currency || "GBP", null),
    applications: j.applications ?? null,
    contract_type: j.contractType || null,
    job_type: j.jobType || null,
    description: j.jobDescription || null,
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const rows = (body?.results ?? []).map(toRow).filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: body?.totalResults ?? null }, results: rows }
}

export function validate(o: SearchOpts): string | null {
  if (o.country && o.country !== "GB") return "Reed covers the United Kingdom only"
  if (!o.query && !o.location) return "give --query or --location"
  for (const k of ["distance", "salary-min"]) if (o.extra[k] && !/^\d+$/.test(o.extra[k])) return `--${k} must be a whole number`
  if (o.extra["direct-employer"] && o.extra["direct-employer"] !== "1") return "--direct-employer takes only 1"
  return null
}

function auth(): string {
  return "Basic " + Buffer.from(`${requireEnv("REED_API_KEY")}:`).toString("base64")
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ resultsToTake: String(Math.min(o.limit, 100)), resultsToSkip: String((o.page - 1) * o.limit) })
  if (o.query) p.set("keywords", o.query)
  if (o.location) p.set("locationName", o.location)
  if (o.extra.distance) p.set("distanceFromLocation", o.extra.distance)
  if (o.extra["salary-min"]) p.set("minimumSalary", o.extra["salary-min"])
  if (o.extra["direct-employer"]) p.set("postedByDirectEmployer", "true")
  const { body } = await fetchJson<Body>(`${BASE}/api/1.0/search?${p}`, { headers: { Authorization: auth() } })
  return mapSearch(body, o)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/(\d{6,})/)
  return m ? m[1] : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a Reed job id from "${input}"`, "BAD_ID")
  const { body } = await fetchJson<Job>(`${BASE}/api/1.0/jobs/${id}`, { headers: { Authorization: auth() } })
  if (!body || !body.jobId) return null
  return { ...toRow(body), description: cleanHtml(body.jobDescription) }
}
