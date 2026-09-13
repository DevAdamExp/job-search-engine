// Singapore — MyCareersFuture (WSG / MOM) public JSON API. No key.
// GET https://api.mycareersfuture.gov.sg/v2/jobs?search=&limit=&page= (page is 0-based); detail /v2/jobs/{uuid}.
import { CliError, cleanHtml, fetchJson, isoDate, money, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "mycareersfuture-sg-search"
export const SUMMARY = "Singapore's official MyCareersFuture portal (public API, no key)"
export const NOTES = `Singapore-only, so --location is folded into the keywords (e.g. "Jurong"). Salaries are SGD per
month unless the posting says otherwise. --jobage filters client-side on the posting date.`
export const EXTRA_FLAGS: Record<string, string> = {}

const BASE = (process.env.MCF_API_URL ?? "").trim().replace(/\/+$/, "") || "https://api.mycareersfuture.gov.sg"

interface Job {
  uuid: string
  title?: string
  description?: string | null
  metadata?: { jobPostId?: string; newPostingDate?: string; originalPostingDate?: string; expiryDate?: string; jobDetailsUrl?: string }
  hiringCompany?: { name?: string | null } | null
  postedCompany?: { name?: string | null } | null
  address?: { district?: string | null; region?: string | null; postalCode?: string | null } | null
  salary?: { minimum?: number | null; maximum?: number | null; type?: { salaryType?: string | null } | null } | null
  employmentTypes?: { employmentType?: string }[]
  positionLevels?: { position?: string }[]
  numberOfVacancies?: number | null
  minimumYearsExperience?: number | null
  status?: { jobStatus?: string } | null
}

export function toRow(j: Job): Row {
  const m = j.metadata ?? {}
  const a = j.address ?? {}
  const place = [a.district, a.region].filter(Boolean).join(", ")
  return {
    id: j.uuid,
    title: j.title || "(untitled)",
    company: j.hiringCompany?.name || j.postedCompany?.name || null,
    location: place ? `${place}, Singapore` : "Singapore",
    date: isoDate(m.newPostingDate || m.originalPostingDate),
    url: m.jobDetailsUrl || `https://www.mycareersfuture.gov.sg/job/${j.uuid}`,
    job_post_id: m.jobPostId ?? null,
    deadline: isoDate(m.expiryDate),
    salary: money(j.salary?.minimum ?? null, j.salary?.maximum ?? null, "SGD", (j.salary?.type?.salaryType || "Monthly").toLowerCase()),
    employment_type: (j.employmentTypes ?? []).map((t) => t.employmentType).filter(Boolean).join(", ") || null,
    position_level: (j.positionLevels ?? []).map((t) => t.position).filter(Boolean).join(", ") || null,
    vacancies: j.numberOfVacancies ?? null,
    min_years_experience: j.minimumYearsExperience ?? null,
    status: j.status?.jobStatus ?? null,
  }
}

export function mapSearch(body: { results?: Job[]; total?: number } | null, o: SearchOpts): SearchResult {
  const rows = (body?.results ?? []).map(toRow).filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: body?.total ?? null }, results: rows }
}

export function validate(_o: SearchOpts): string | null {
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ limit: String(o.limit), page: String(o.page - 1) })
  const q = [o.query, o.location].filter(Boolean).join(" ")
  if (q) p.set("search", q)
  const { body } = await fetchJson<{ results?: Job[]; total?: number }>(`${BASE}/v2/jobs?${p}`)
  return mapSearch(body, o)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/([0-9a-f]{32})(?:[/?#]|$)/i)
  return m ? m[1].toLowerCase() : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a MyCareersFuture job uuid from "${input}"`, "BAD_ID")
  const { body } = await fetchJson<Job>(`${BASE}/v2/jobs/${id}`)
  if (!body) return null
  return { ...toRow(body), description: cleanHtml(body.description) }
}
