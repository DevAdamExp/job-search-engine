// Careerjet — partner search API across 62 countries. Needs a free publisher key
// (https://www.careerjet.com/partners/api/): HTTP Basic auth, username = key, empty password
// (CAREERJET_API_KEY). The API requires the END USER's IP and user agent on every call — the engine
// passes them through from the CRM request (--user-ip / --user-agent); defaults are the engine's own.
import { CliError, fetchJson, isoDate, requireEnv, UA, withinDays, type Row, type SearchOpts, type SearchResult } from "./lib.js"

export const NAME = "careerjet-search"
export const SUMMARY = "Careerjet partner API (62 countries incl. Pakistan, the Gulf, Bangladesh; free key required)"
export const NOTES = `--country XX picks the locale (default GB). --jobage is applied client-side (the API sorts by date).
Rows have no stable id, so \`id\` is derived from the posting url; \`detail\` is not available (rows carry a snippet).
Set CAREERJET_API_KEY. Pass --user-ip / --user-agent of the person searching, as the API terms require.`
export const EXTRA_FLAGS: Record<string, string> = {
  "user-ip": "IP address of the person searching (required by Careerjet; default 127.0.0.1)",
  "user-agent": "browser user agent of the person searching",
  "contract-type": "p permanent | c contract | t temporary | i training | v voluntary",
  "work-hours": "f full-time | p part-time",
}

export const LOCALES: Record<string, string> = {
  AE: "en_AE", AR: "es_AR", AT: "de_AT", AU: "en_AU", BD: "en_BD", BE: "fr_BE", BO: "es_BO", BR: "pt_BR", CA: "en_CA", CH: "de_CH",
  CL: "es_CL", CN: "en_CN", CO: "es_CO", CR: "es_CR", CZ: "cs_CZ", DE: "de_DE", DK: "da_DK", DO: "es_DO", EC: "es_EC", ES: "es_ES",
  FI: "fi_FI", FR: "fr_FR", GB: "en_GB", GT: "es_GT", HK: "en_HK", HU: "hu_HU", IE: "en_IE", IN: "en_IN", IT: "it_IT", JP: "ja_JP",
  KR: "ko_KR", KW: "en_KW", LU: "fr_LU", MA: "fr_MA", MX: "es_MX", MY: "en_MY", NL: "nl_NL", NO: "no_NO", NZ: "en_NZ", OM: "en_OM",
  PA: "es_PA", PE: "es_PE", PH: "en_PH", PK: "en_PK", PL: "pl_PL", PR: "es_PR", PT: "pt_PT", PY: "es_PY", QA: "en_QA", RU: "ru_RU",
  SA: "en_SA", SE: "sv_SE", SG: "en_SG", SK: "sk_SK", TR: "tr_TR", TW: "en_TW", UA: "uk_UA", US: "en_US", UY: "es_UY", VE: "es_VE",
  VN: "vi_VN", ZA: "en_ZA",
}
const BASE = (process.env.CAREERJET_API_URL ?? "").trim().replace(/\/+$/, "") || "https://search.api.careerjet.net"

interface Job {
  title?: string
  company?: string | null
  locations?: string | null
  date?: string
  url?: string
  description?: string | null
  salary?: string | null
  salary_min?: number | string | null
  salary_max?: number | string | null
  salary_currency_code?: string | null
  salary_type?: string | null
}
interface Body { type?: string; hits?: number; pages?: number; jobs?: Job[]; message?: string }

function idFrom(url: string): string {
  let h = 0
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `cj-${h.toString(16)}`
}

export function toRow(j: Job): Row {
  const url = j.url || ""
  return {
    id: idFrom(url),
    title: j.title || "(untitled)",
    company: j.company || null,
    location: j.locations || null,
    date: isoDate(j.date),
    url: url,
    salary: j.salary || null,
    salary_currency: j.salary_currency_code || null,
    description: j.description || null,
  }
}

export function mapSearch(body: Body | null, o: SearchOpts): SearchResult {
  if (body?.type === "ERROR") throw new CliError(body.message || "Careerjet error", "SEARCH_FAILED")
  const rows = (body?.jobs ?? []).map(toRow).filter((r) => withinDays(r.date, o.jobage))
  return { meta: { page: o.page, limit: o.limit, total: body?.hits ?? null, api_pages: body?.pages ?? null }, results: rows }
}

export function validate(o: SearchOpts): string | null {
  const cc = o.country ?? "GB"
  if (!LOCALES[cc]) return `Careerjet has no locale for ${cc}`
  if (!o.query && !o.location) return "give --query or --location"
  if (o.page > 10) return "Careerjet serves at most 10 pages per query"
  if (o.extra["contract-type"] && !/^[pctiv]$/.test(o.extra["contract-type"])) return "--contract-type must be p, c, t, i or v"
  if (o.extra["work-hours"] && !/^[fp]$/.test(o.extra["work-hours"])) return "--work-hours must be f or p"
  if (o.extra["user-ip"] && !/^[0-9a-fA-F:.]{3,45}$/.test(o.extra["user-ip"])) return "--user-ip must be an IP address"
  return null
}

export async function search(o: SearchOpts): Promise<SearchResult> {
  const key = requireEnv("CAREERJET_API_KEY")
  const p = new URLSearchParams({
    locale_code: LOCALES[o.country ?? "GB"], page: String(o.page), page_size: String(Math.min(o.limit, 100)), sort: "date",
    user_ip: o.extra["user-ip"] || "127.0.0.1", user_agent: o.extra["user-agent"] || UA,
  })
  if (o.query) p.set("keywords", o.query)
  if (o.location) p.set("location", o.location)
  if (o.extra["contract-type"]) p.set("contract_type", o.extra["contract-type"])
  if (o.extra["work-hours"]) p.set("work_hours", o.extra["work-hours"])
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64")
  const { body } = await fetchJson<Body>(`${BASE}/v4/query?${p}`, { headers: { Authorization: auth } })
  return mapSearch(body, o)
}

export async function detail(_input: string): Promise<(Row & { description: string | null }) | null> {
  throw new CliError("Careerjet has no detail endpoint; open the posting url", "NOT_SUPPORTED")
}
