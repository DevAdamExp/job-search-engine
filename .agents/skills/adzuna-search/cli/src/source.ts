// Adzuna — job API in 19 countries. Needs a free developer key: https://developer.adzuna.com/signup
// (ADZUNA_APP_ID, ADZUNA_APP_KEY). Terms: every displayed result must carry the "Jobs by Adzuna"
// attribution; default quota 25/min, 250/day. Docs: https://developer.adzuna.com/overview
import { CliError, fetchJson, isoDate, money, requireEnv, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "adzuna-search"
export const SUMMARY = "Adzuna job API (19 countries; free key required)"
export const NOTES = `Countries: ${"gb us at au be br ca ch de es fr in it mx nl nz pl sg za".toUpperCase()}. --country is required
(default GB). --jobage maps to max_days_old. Set ADZUNA_APP_ID and ADZUNA_APP_KEY in the environment.
Attribution "Jobs by Adzuna" is required wherever rows are shown.`
export const EXTRA_FLAGS: Record<string, string> = {
  distance: "km around --location (default 5)",
  "salary-min": "minimum annual salary in local currency",
  "full-time": "1 — full-time only",
  permanent: "1 — permanent only",
}

export const COUNTRIES = new Set(["GB", "US", "AT", "AU", "BE", "BR", "CA", "CH", "DE", "ES", "FR", "IN", "IT", "MX", "NL", "NZ", "PL", "SG", "ZA"])
const BASE = (process.env.ADZUNA_API_URL ?? "").trim().replace(/\/+$/, "") || "https://api.adzuna.com"

interface Job {
  id: string | number
  title?: string
  description?: string | null
  created?: string
  redirect_url?: string
  adref?: string
  company?: { display_name?: string | null } | null
  location?: { display_name?: string | null; area?: string[] } | null
  category?: { label?: string | null } | null
  salary_min?: number | null
  salary_max?: number | null
  salary_is_predicted?: string | number | null
  contract_time?: string | null
  contract_type?: string | null
}
interface Body { count?: number; results?: Job[] }

export function toRow(j: Job): Row {
  return {
    id: String(j.id),
    title: (j.title || "(untitled)").replace(/<\/?strong>/g, ""),
    company: j.company?.display_name || null,
    location: j.location?.display_name || null,
    date: isoDate(j.created),
    url: j.redirect_url || "",
    salary: money(j.salary_min ?? null, j.salary_max ?? null, null, null),
    salary_predicted: j.salary_is_predicted === "1" || j.salary_is_predicted === 1,
    contract_time: j.contract_time || null,
    contract_type: j.contract_type || null,
    category: j.category?.label || null,
    description: j.description || null,
    attribution: "Jobs by Adzuna",
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  return { meta: { page: o.page, limit: o.limit, total: body?.count ?? null, attribution: "Jobs by Adzuna" }, results: (body?.results ?? []).map(toRow) }
}

export function validate(o: SearchOpts): string | null {
  const cc = o.country ?? "GB"
  if (!COUNTRIES.has(cc)) return `Adzuna does not cover ${cc} (it covers ${[...COUNTRIES].join(" ")})`
  if (!o.query && !o.location) return "give --query or --location"
  for (const k of ["distance", "salary-min"]) if (o.extra[k] && !/^\d+$/.test(o.extra[k])) return `--${k} must be a whole number`
  for (const k of ["full-time", "permanent"]) if (o.extra[k] && o.extra[k] !== "1") return `--${k} takes only 1`
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const id = requireEnv("ADZUNA_APP_ID")
  const key = requireEnv("ADZUNA_APP_KEY")
  const cc = (o.country ?? "GB").toLowerCase()
  const p = new URLSearchParams({ app_id: id, app_key: key, results_per_page: String(o.limit), "content-type": "application/json" })
  if (o.query) p.set("what", o.query)
  if (o.location) p.set("where", o.location)
  if (o.jobage) p.set("max_days_old", String(o.jobage))
  if (o.extra.distance) p.set("distance", o.extra.distance)
  if (o.extra["salary-min"]) p.set("salary_min", o.extra["salary-min"])
  if (o.extra["full-time"]) p.set("full_time", "1")
  if (o.extra.permanent) p.set("permanent", "1")
  const { body } = await fetchJson<Body>(`${BASE}/v1/api/jobs/${cc}/search/${o.page}?${p}`)
  return mapSearch(body, o)
}

export async function detail(_input: string): Promise<(Row & { description: string | null }) | null> {
  throw new CliError("Adzuna has no detail endpoint; search rows already carry the description and the redirect url", "NOT_SUPPORTED")
}
