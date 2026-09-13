// Switzerland — job-room.ch (SECO public employment service) JSON API. No key.
// POST https://www.job-room.ch/jobadservice/api/jobAdvertisements/_search?page=&size=&sort=date_desc
// with a JSON body; total in the X-Total-Count header. Detail: GET .../jobAdvertisements/{id}.
import { CliError, fetchJson, isoDate, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "jobroom-ch-search"
export const SUMMARY = "Switzerland's official job-room.ch (public API, no key)"
export const NOTES = `Keywords match in German, French, Italian and English titles. --jobage maps to the board's own
onlineSince filter. --location is folded into the keywords (the API filters by commune codes, not text).
Ads list a workload range (\`workload\`) and the languages required (\`languages\`).`
export const EXTRA_FLAGS: Record<string, string> = {}

const BASE = (process.env.JOBROOM_API_URL ?? "").trim().replace(/\/+$/, "") || "https://www.job-room.ch"

interface Ad {
  jobAdvertisement: {
    id: string
    createdTime?: string
    publication?: { startDate?: string; endDate?: string }
    jobContent?: {
      externalUrl?: string | null
      numberOfJobs?: string | number | null
      jobDescriptions?: { languageIsoCode?: string; title?: string; description?: string }[]
      company?: { name?: string | null; city?: string | null } | null
      location?: { city?: string | null; postalCode?: string | null; cantonCode?: string | null; countryIsoCode?: string | null } | null
      employment?: { workloadPercentageMin?: string | number | null; workloadPercentageMax?: string | number | null; permanent?: boolean | null } | null
      languageSkills?: { languageIsoCode?: string }[] | null
    }
  }
}

const strip = (s: string | undefined | null) => (s ?? "").replace(/<\/?em>/g, "").trim()

export function toRow(a: Ad): Row {
  const j = a.jobAdvertisement
  const c = j.jobContent ?? {}
  const d = (c.jobDescriptions ?? []).find((x) => x.languageIsoCode === "en") ?? (c.jobDescriptions ?? [])[0] ?? {}
  const loc = c.location ?? {}
  const e = c.employment ?? {}
  const wl = e.workloadPercentageMin != null && e.workloadPercentageMax != null
    ? (String(e.workloadPercentageMin) === String(e.workloadPercentageMax) ? `${e.workloadPercentageMin}%` : `${e.workloadPercentageMin}–${e.workloadPercentageMax}%`) : null
  return {
    id: j.id,
    title: strip(d.title) || "(untitled)",
    company: c.company?.name || null,
    location: [loc.city, loc.cantonCode].filter(Boolean).join(", ") || null,
    date: isoDate(j.publication?.startDate || j.createdTime),
    url: `https://www.job-room.ch/job-search/${j.id}`,
    deadline: isoDate(j.publication?.endDate),
    external_url: c.externalUrl || null,
    workload: wl,
    permanent: e.permanent ?? null,
    languages: [...new Set((c.languageSkills ?? []).map((l) => l.languageIsoCode).filter(Boolean))].join(", ") || null,
    vacancies: c.numberOfJobs != null ? Number(c.numberOfJobs) : null,
  }
}

export function mapSearch(body: Ad[] | null, o: SearchOpts, total?: number | null): SearchResult {
  return { meta: { page: o.page, limit: o.limit, total: total ?? null }, results: (body ?? []).map(toRow) }
}

export function validate(_o: SearchOpts): string | null {
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const keywords = [o.query, o.location].filter(Boolean).join(" ").split(/\s+/).filter(Boolean)
  const req = {
    keywords, onlineSince: o.jobage ?? 60, workloadPercentageMin: 10, workloadPercentageMax: 100,
    displayRestricted: false, professionCodes: [], communalCodes: [], cantonCodes: [],
  }
  const url = `${BASE}/jobadservice/api/jobAdvertisements/_search?page=${o.page - 1}&size=${o.limit}&sort=date_desc`
  const { body, headers } = await fetchJson<Ad[]>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) })
  const total = Number(headers.get("x-total-count"))
  return mapSearch(body, o, Number.isFinite(total) ? total : null)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return m ? m[1].toLowerCase() : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse a job-room ad id from "${input}"`, "BAD_ID")
  const { body } = await fetchJson<Ad["jobAdvertisement"]>(`${BASE}/jobadservice/api/jobAdvertisements/${id}`)
  if (!body) return null
  const ad: Ad = { jobAdvertisement: body }
  const d = (body.jobContent?.jobDescriptions ?? []).find((x) => x.languageIsoCode === "en") ?? (body.jobContent?.jobDescriptions ?? [])[0]
  return { ...toRow(ad), description: strip(d?.description).replace(/#{2,}\s*/g, "").trim() || null }
}
