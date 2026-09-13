// Sweden — Platsbanken via the JobTech open API (Arbetsförmedlingen). Public, no key.
// Docs: https://jobsearch.api.jobtechdev.se (search: /search?q=&limit=&offset=&published-after=; ad: /ad/{id}).
import { CliError, fetchJson, isoDate, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "jobtech-se-search"
export const SUMMARY = "Sweden's official Platsbanken (JobTech open API, no key)"
export const NOTES = `Free-text search; Swedish terms match best (kock, sjuksköterska) but English titles are found too.
--location is folded into the query — Platsbanken resolves place names itself. Ads carry an
application deadline (\`deadline\`) and the employer's organisation number.`
export const EXTRA_FLAGS: Record<string, string> = {}

const BASE = (process.env.JOBTECH_API_URL ?? "").trim().replace(/\/+$/, "") || "https://jobsearch.api.jobtechdev.se"

interface Hit {
  id: string
  headline?: string
  webpage_url?: string
  publication_date?: string
  application_deadline?: string
  employer?: { name?: string | null; workplace?: string | null; organization_number?: string | null }
  workplace_address?: { municipality?: string | null; region?: string | null; city?: string | null }
  salary_description?: string | null
  employment_type?: { label?: string | null } | null
  working_hours_type?: { label?: string | null } | null
  occupation?: { label?: string | null } | null
  number_of_vacancies?: number | null
  description?: { text?: string | null } | null
}

export function toRow(h: Hit): Row {
  const a = h.workplace_address ?? {}
  return {
    id: String(h.id),
    title: h.headline || "(untitled)",
    company: h.employer?.name || h.employer?.workplace || null,
    location: [a.city || a.municipality, a.region].filter(Boolean).join(", ") || null,
    date: isoDate(h.publication_date),
    url: h.webpage_url || `https://arbetsformedlingen.se/platsbanken/annonser/${h.id}`,
    deadline: isoDate(h.application_deadline),
    salary: h.salary_description || null,
    employment_type: h.employment_type?.label || null,
    working_hours: h.working_hours_type?.label || null,
    occupation: h.occupation?.label || null,
    vacancies: h.number_of_vacancies ?? null,
    org_number: h.employer?.organization_number || null,
  }
}

export function mapSearch(body: { total?: { value?: number }; hits?: Hit[] } | null, o: SearchOpts): SearchResult {
  const hits = body?.hits ?? []
  return { meta: { page: o.page, limit: o.limit, total: body?.total?.value ?? null }, results: hits.map(toRow) }
}

export function validate(_o: SearchOpts): string | null {
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const q = [o.query, o.location].filter(Boolean).join(" ")
  const p = new URLSearchParams({ limit: String(o.limit), offset: String((o.page - 1) * o.limit) })
  if (q) p.set("q", q)
  if (o.jobage) p.set("published-after", new Date(Date.now() - o.jobage * 86400000).toISOString().slice(0, 19))
  const { body } = await fetchJson<{ total?: { value?: number }; hits?: Hit[] }>(`${BASE}/search?${p}`)
  return mapSearch(body, o)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/(\d{5,})/)
  return m ? m[1] : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a Platsbanken ad id from "${input}"`, "BAD_ID")
  const { body } = await fetchJson<Hit>(`${BASE}/ad/${id}`)
  if (!body) return null
  return { ...toRow(body), description: body.description?.text?.trim() || null }
}
