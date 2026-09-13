// Data source: Canada's official Job Bank (www.jobbank.gc.ca), the Government of Canada job
// board. Search results are a server-rendered HTML page of <article> cards; a posting is a
// server-rendered page marked up with schema.org RDFa (property="..."). Both are public, no
// authentication. robots.txt asks for `Crawl-delay: 5` — keep at least five seconds between
// requests (the job-search-engine service enforces it; when running the CLI by hand, keep
// volume low).
//
// Parsing is chunked regex, like linkedin-search: each card / property is parsed
// independently so one malformed block cannot break the rest.

export const BASE = "https://www.jobbank.gc.ca"
export const SEARCH_URL = `${BASE}/jobsearch/jobsearch`
export const POSTING_URL = `${BASE}/jobsearch/jobposting`

const UA = "Mozilla/5.0 (compatible; jobbank-ca-search-cli/1.0)"
export const CRAWL_DELAY_MS = 5000

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 5
  let delay = 1000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-CA,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      // Never retry faster than the board's robots Crawl-delay (5 s), least of all on a 429.
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, Math.max(delay, CRAWL_DELAY_MS) + jitter))
      delay = Math.min(delay * 2, 20000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/** Inner HTML of the first element whose open tag matches `openRe`, tracking nested tags of
 *  the same name so a wrapper span with spans inside is captured whole. Returns null when the
 *  markup never closes the element (Job Bank leaves the odd span unclosed). */
export function extractFrom(html: string, openRe: RegExp): string | null {
  const open = new RegExp(openRe.source, openRe.flags.includes("i") ? "i" : "").exec(html)
  if (!open) return null
  const tagMatch = open[0].match(/^<([a-z0-9]+)/i)
  if (!tagMatch) return null
  const tag = tagMatch[1].toLowerCase()
  let i = open.index + open[0].length
  let depth = 1
  const nextOpenRe = new RegExp(`<${tag}\\b`, "gi")
  const closeRe = new RegExp(`</${tag}>`, "gi")
  while (depth > 0 && i < html.length) {
    nextOpenRe.lastIndex = i
    closeRe.lastIndex = i
    const nextOpen = nextOpenRe.exec(html)
    const nextClose = closeRe.exec(html)
    if (!nextClose) return null
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++
      i = nextOpen.index + nextOpen[0].length
    } else {
      depth--
      i = nextClose.index + nextClose[0].length
    }
  }
  return html.slice(open.index + open[0].length, i - `</${tag}>`.length)
}

/** Inner HTML of the first element carrying attribute=value (any tag). */
export function extractByAttr(html: string, attr: string, value: string): string | null {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return extractFrom(html, new RegExp(`<[a-z0-9]+[^>]*\\b${attr}=(?:"${escaped}"|'${escaped}')[^>]*>`, "i"))
}

/** Inner HTML of the first element whose class list starts with `cls` (e.g. "jobLMIAflag"). */
export function extractByClass(html: string, cls: string): string | null {
  return extractFrom(html, new RegExp(`<[a-z0-9]+[^>]*\\bclass="${cls}[^"]*"[^>]*>`, "i"))
}

// Job Bank is bilingual: English "September 08, 2026" and French "8 septembre 2026" both occur.
const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06", july: "07",
  august: "08", september: "09", october: "10", november: "11", december: "12",
  janvier: "01", février: "02", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06", juillet: "07",
  août: "08", aout: "08", septembre: "09", octobre: "10", novembre: "11", décembre: "12", decembre: "12",
}

/** "September 08, 2026" / "Posted on September 8, 2026" / "Publié le 8 septembre 2026" → "2026-09-08";
 *  ISO passes through. */
export function parseDate(text: string | null | undefined): string | null {
  if (!text) return null
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const en = text.match(/([A-Za-zéûÉÛ]+)\s+(\d{1,2}),\s*(\d{4})/)
  const fr = text.match(/(\d{1,2})(?:er)?\s+([A-Za-zéûÉÛ]+)\s+(\d{4})/)
  const [monthName, day, year] = en ? [en[1], en[2], en[3]] : fr ? [fr[2], fr[1], fr[3]] : [null, null, null]
  if (!monthName || !day || !year) return null
  const mm = MONTHS[monthName.toLowerCase()]
  if (!mm) return null
  return `${year}-${mm}-${day.padStart(2, "0")}`
}

export type Lmia = "requested" | "approved" | null

/** The LMIA marker → requested | approved | null. Prefer the flag's own class (Job Bank marks
 *  the element `jobLMIAflag submitted` / `jobLMIAflag approved`); fall back to its text, testing
 *  the weaker state first so "requested - not yet approved" never reads as approved. */
export function parseLmia(text: string | null | undefined, classes: string | null = null): Lmia {
  const c = (classes || "").toLowerCase()
  if (/\bsubmitted\b|\brequested\b|\bpending\b/.test(c)) return "requested"
  if (/\bapproved\b/.test(c)) return "approved"
  const t = (text || "").toLowerCase()
  if (!/lmia/.test(t)) return null
  if (/(requested|submitted|pending|not (yet )?approved)/.test(t)) return "requested"
  if (/approved/.test(t)) return "approved"
  return null
}

/** The class attribute of the first element whose class list starts with `cls`. */
export function classesOf(html: string, cls: string): string | null {
  const m = new RegExp(`<[a-z0-9]+[^>]*\\bclass="(${cls}[^"]*)"`, "i").exec(html)
  return m ? m[1] : null
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
  lmia: Lmia
  workplace: string | null
  jobNumber: string | null
}

/** Parse the search-results page: one <article id="article-<id>"> per posting. */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/<article id="article-/).slice(1)
  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)/)
    if (!idMatch) continue
    const id = idMatch[1]
    const titleHtml = chunk.match(/class="noctitle"[^>]*>([\s\S]*?)<\/span>/i)
    const title = titleHtml ? clean(titleHtml[1]) : ""
    if (!title) continue
    const li = (cls: string): string | null => {
      const m = chunk.match(new RegExp(`<li class="${cls}"[^>]*>([\\s\\S]*?)</li>`, "i"))
      return m ? clean(m[1]) : null
    }
    const company = li("business")
    const location = (li("location") || "").replace(/^Location\s*/i, "").trim() || null
    const salaryRaw = li("salary")
    const salary = salaryRaw ? salaryRaw.replace(/^Salary\s*/i, "").trim() || null : null
    const sourceRaw = li("source")
    const jobNumber = sourceRaw ? (sourceRaw.match(/(\d{5,})/)?.[1] ?? null) : null
    const lmiaHtml = extractByClass(chunk, "jobLMIAflag")
    const lmia = parseLmia(lmiaHtml ? clean(lmiaHtml) : null, classesOf(chunk, "jobLMIAflag"))
    const workplaceHtml = chunk.match(/class="telework"[^>]*>([\s\S]*?)<\/span>/i)
    results.push({
      id,
      title,
      company,
      location,
      date: parseDate(li("date")),
      url: `${POSTING_URL}/${id}`,
      salary,
      lmia,
      workplace: workplaceHtml ? clean(workplaceHtml[1]) || null : null,
      jobNumber,
    })
  }
  return results
}

/** Total results announced by the page ("<span class="found" id="results-count">312</span>"). */
export function parseTotal(html: string): number | null {
  const m = html.match(/id="results-count"[^>]*>\s*([\d,]+)\s*</i)
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : null
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  validThrough: string | null
  salary: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  salaryUnit: string | null
  workHours: string | null
  employmentType: string | null
  noc: string | null
  vacancies: number | null
  lmia: Lmia
  description: string | null
  isActive: boolean
}

function prop(html: string, name: string): string | null {
  const inner = extractByAttr(html, "property", name)
  if (inner !== null) return clean(inner) || null
  // Unbalanced markup (an unclosed <span property=...>): take the text before the next tag.
  const m = new RegExp(`<[a-z0-9]+[^>]*\\bproperty=(?:"${name}"|'${name}')[^>]*>([^<]*)`, "i").exec(html)
  return m ? clean(m[1]) || null : null
}

function propContent(html: string, name: string): string | null {
  const m = new RegExp(`<[a-z0-9]+[^>]*\\bproperty="${name}"[^>]*\\bcontent="([^"]*)"`, "i").exec(html)
  return m ? decodeHtmlEntities(m[1]) : null
}

/** Parse a posting page (schema.org RDFa). */
export function parseJobDetail(html: string, id: string, today: string = new Date().toISOString().slice(0, 10)): JobDetail {
  const title = prop(html, "title") || clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") || "(untitled)"
  const orgHtml = extractByAttr(html, "property", "hiringOrganization")
  const company = orgHtml ? (clean(extractByAttr(orgHtml, "property", "name") || orgHtml) || null) : null
  const date = parseDate(prop(html, "datePosted"))
  const validThrough = parseDate(prop(html, "validThrough"))

  const locality = prop(html, "addressLocality")
  const region = prop(html, "addressRegion")
  const location = locality ? (region ? `${locality} (${region})` : locality) : null

  const salaryHtml = extractByAttr(html, "property", "baseSalary")
  const minRaw = salaryHtml ? propContent(salaryHtml, "minValue") ?? propContent(salaryHtml, "value") : null
  const maxRaw = salaryHtml ? propContent(salaryHtml, "maxValue") : null
  const currency = salaryHtml ? propContent(salaryHtml, "currency") : null
  const unit = salaryHtml ? (prop(salaryHtml, "unitText") || null) : null
  const workHours = salaryHtml ? (prop(salaryHtml, "workHours") || null) : null
  const salary = salaryHtml ? (clean(salaryHtml).replace(/\s*\/\s*.*$/, "").trim() || null) : null

  const employmentType = prop(html, "employmentType")
  const nocMatch = html.match(/class="noc-no"[^>]*>\s*NOC\s*(\d{4,5})/i)
  const vacMatch = html.match(/(\d+)\s+vacanc/i)
  const lmiaHtml = extractByClass(html, "jobLMIAflag job-marker") ?? extractByClass(html, "jobLMIAflag")
  const lmia = parseLmia(lmiaHtml ? clean(lmiaHtml) : null, classesOf(html, "jobLMIAflag"))
  const description = prop(html, "description")
  const expired = /this job posting has expired|no longer available|posting is closed/i.test(html)
  const isActive = !expired && (!validThrough || validThrough >= today)

  return {
    id,
    title,
    company,
    location,
    date,
    url: `${POSTING_URL}/${id}`,
    validThrough,
    salary,
    salaryMin: minRaw !== null && minRaw !== "" && !isNaN(Number(minRaw)) ? Number(minRaw) : null,
    salaryMax: maxRaw !== null && maxRaw !== "" && !isNaN(Number(maxRaw)) ? Number(maxRaw) : null,
    currency,
    salaryUnit: unit,
    workHours,
    employmentType,
    noc: nocMatch ? nocMatch[1] : null,
    vacancies: vacMatch ? parseInt(vacMatch[1], 10) : null,
    lmia,
    description,
    isActive,
  }
}

/** --jobage days → Job Bank's `fage` facet (2 = last two days, 30 = last thirty; anything
 *  wider is unfiltered). The CLI also filters client-side by the card date. */
export function jobageToFage(days: number | undefined): string | null {
  if (!days || days <= 0) return null
  if (days <= 2) return "2"
  if (days <= 30) return "30"
  return null
}

/** --lmia → the `fskl` facet value. */
export function lmiaToFskl(mode: string | undefined): string | null {
  switch ((mode || "any").toLowerCase()) {
    case "requested":
      return "101010"
    case "approved":
      return "101020"
    case "any":
    case "":
      return null
    default:
      throw new Error(`--lmia must be requested, approved or any (got "${mode}")`)
  }
}
