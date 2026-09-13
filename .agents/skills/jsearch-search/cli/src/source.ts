// JSearch (OpenWeb Ninja on RapidAPI) — Google-for-Jobs results, 40+ countries. Needs a RapidAPI key
// (RAPIDAPI_KEY). Free plan: 200 requests/month — the CRM treats this board as a FALLBACK for
// countries no other board covers (SKILL.md `fallback: true`).
import { CliError, fetchJson, isoDate, money, requireEnv, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "jsearch-search"
export const SUMMARY = "JSearch (Google for Jobs via RapidAPI; key required; low quota — fallback)"
export const NOTES = `--country XX is passed to the API (any ISO code it knows). --location is appended to the query
("nurse in Dubai"). --jobage maps to date_posted (1 → today, 7 → week, 14/30 → month). Set RAPIDAPI_KEY.`
export const EXTRA_FLAGS: Record<string, string> = {
  "employment-types": "FULLTIME,CONTRACTOR,PARTTIME,INTERN (comma list)",
  remote: "true — remote roles only",
}

const HOST = (process.env.JSEARCH_API_HOST ?? "").trim() || "jsearch.p.rapidapi.com"

interface Job {
  job_id: string
  job_title?: string
  employer_name?: string | null
  job_city?: string | null
  job_state?: string | null
  job_country?: string | null
  job_posted_at_datetime_utc?: string | null
  job_apply_link?: string
  job_description?: string | null
  job_is_remote?: boolean | null
  job_min_salary?: number | null
  job_max_salary?: number | null
  job_salary_currency?: string | null
  job_salary_period?: string | null
  job_employment_type?: string | null
  job_publisher?: string | null
}
interface Body { status?: string; data?: Job[] }

export function toRow(j: Job): Row {
  return {
    id: j.job_id,
    title: j.job_title || "(untitled)",
    company: j.employer_name || null,
    location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ") || null,
    date: isoDate(j.job_posted_at_datetime_utc),
    url: j.job_apply_link || "",
    remote: j.job_is_remote ?? null,
    salary: money(j.job_min_salary ?? null, j.job_max_salary ?? null, j.job_salary_currency ?? null, j.job_salary_period ? `per ${j.job_salary_period.toLowerCase()}` : null),
    employment_type: j.job_employment_type || null,
    publisher: j.job_publisher || null,
    description: j.job_description || null,
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  return { meta: { page: o.page, limit: o.limit, total: null }, results: (body?.data ?? []).map(toRow).slice(0, o.limit) }
}

export function validate(o: SearchOpts): string | null {
  if (!o.query) return "give --query (JSearch needs keywords)"
  if (o.extra.remote && o.extra.remote !== "true") return "--remote takes only true"
  if (o.extra["employment-types"] && !/^[A-Z,]+$/.test(o.extra["employment-types"])) return "--employment-types is a comma list of FULLTIME, CONTRACTOR, PARTTIME, INTERN"
  return null
}

function headers(): Record<string, string> {
  return { "X-RapidAPI-Key": requireEnv("RAPIDAPI_KEY"), "X-RapidAPI-Host": HOST }
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ query: o.location ? `${o.query} in ${o.location}` : String(o.query), page: String(o.page), num_pages: "1" })
  if (o.country) p.set("country", o.country.toLowerCase())
  if (o.jobage) p.set("date_posted", o.jobage === 1 ? "today" : o.jobage === 7 ? "week" : "month")
  if (o.extra.remote) p.set("work_from_home", "true")
  if (o.extra["employment-types"]) p.set("employment_types", o.extra["employment-types"])
  const { body } = await fetchJson<Body>(`https://${HOST}/search?${p}`, { headers: headers() })
  return mapSearch(body, o)
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = input.trim()
  if (!id || id.startsWith("-")) throw new CliError("give a JSearch job_id", "BAD_ID")
  const { body } = await fetchJson<Body>(`https://${HOST}/job-details?${new URLSearchParams({ job_id: id })}`, { headers: headers() })
  const job = body?.data?.[0]
  if (!job) return null
  const r = toRow(job)
  return { ...r, description: (r.description as string | null) ?? null }
}
