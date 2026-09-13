// Norway — Arbeidsplassen (NAV) through the JSON search API its own site calls. No key.
// GET https://arbeidsplassen.nav.no/stillinger/api/search?q=&size=&from=  (Elasticsearch-shaped hits).
// There is no JSON detail endpoint; `detail` re-searches by uuid and returns that row.
import { CliError, fetchJson, isoDate, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "arbeidsplassen-no-search"
export const SUMMARY = "Norway's official Arbeidsplassen (NAV) job board (public API, no key)"
export const NOTES = `Norwegian terms match best (kokk, sykepleier); many ads are in English. --location is folded into
the query. Ads carry the application deadline (\`deadline\`) and the languages the job is run in (\`languages\`).`
export const EXTRA_FLAGS: Record<string, string> = {}

const BASE = (process.env.ARBEIDSPLASSEN_API_URL ?? "").trim().replace(/\/+$/, "") || "https://arbeidsplassen.nav.no"

interface Source {
  uuid: string
  title?: string
  published?: string
  expires?: string
  status?: string
  businessName?: string | null
  employer?: { name?: string | null } | null
  locationList?: { country?: string | null; county?: string | null; municipal?: string | null; city?: string | null }[]
  properties?: { jobtitle?: string; applicationdue?: string; engagementtype?: string; extent?: string; workLanguage?: string[]; positioncount?: string | number }
}
interface Body { hits?: { total?: { value?: number }; hits?: { _source: Source }[] } }

export function toRow(s: Source): Row {
  const l = (s.locationList ?? [])[0] ?? {}
  const p = s.properties ?? {}
  const place = [l.city || (l.municipal ? title(l.municipal) : null), l.county ? title(l.county) : null].filter(Boolean).join(", ")
  return {
    id: s.uuid,
    title: s.title || p.jobtitle || "(untitled)",
    company: s.employer?.name || s.businessName || null,
    location: place || (l.country ? title(l.country) : null),
    date: isoDate(s.published),
    url: `${BASE}/stillinger/stilling/${s.uuid}`,
    deadline: isoDate(p.applicationdue) ?? isoDate(s.expires),
    expires: isoDate(s.expires),
    job_title: p.jobtitle ?? null,
    engagement: p.engagementtype ?? null,
    extent: p.extent ?? null,
    languages: (p.workLanguage ?? []).join(", ") || null,
    vacancies: p.positioncount != null ? Number(p.positioncount) : null,
    status: s.status ?? null,
  }
}

function title(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase())
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  const hits = body?.hits?.hits ?? []
  // The API serves 25 per call regardless of `size`; `from` does work. Cap client-side.
  const rows = hits.map((h) => toRow(h._source)).filter((r) => withinDays(r.date, o.jobage)).slice(0, o.limit)
  return { meta: { page: o.page, limit: o.limit, total: body?.hits?.total?.value ?? null }, results: rows }
}

export function validate(_o: SearchOpts): string | null {
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const p = new URLSearchParams({ size: String(o.limit), from: String((o.page - 1) * 25) })
  const q = [o.query, o.location].filter(Boolean).join(" ")
  if (q) p.set("q", q)
  const { body } = await fetchJson<Body>(`${BASE}/stillinger/api/search?${p}`)
  return mapSearch(body, o)
}

export function normalizeId(input: string): string | null {
  const m = input.trim().match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return m ? m[1].toLowerCase() : null
}

export async function detail(input: string): Promise<(Row & { description: string | null }) | null> {
  const id = normalizeId(input)
  if (!id) throw new CliError(`could not parse an Arbeidsplassen ad uuid from "${input}"`, "BAD_ID")
  const { body } = await fetchJson<Body>(`${BASE}/stillinger/api/search?q=${id}&size=5`)
  const hit = (body?.hits?.hits ?? []).find((h) => h._source.uuid === id)
  if (!hit) return null
  // The site has no JSON detail endpoint; the full text lives on the HTML page at `url`.
  return { ...toRow(hit._source), description: null }
}
