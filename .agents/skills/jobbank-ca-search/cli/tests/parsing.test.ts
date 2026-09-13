import { describe, expect, test } from "bun:test"
import { join } from "path"
import {
  parseJobCards,
  parseJobDetail,
  parseTotal,
  parseDate,
  parseLmia,
  jobageToFage,
  lmiaToFskl,
  extractByAttr,
} from "../src/helpers.ts"
import { buildUrl } from "../src/commands/search.ts"
import { normalizeId } from "../src/commands/detail.ts"

const fixture = (name: string) => Bun.file(join(import.meta.dir, "fixtures", name)).text()

describe("search cards", () => {
  test("parses LMIA-filtered cards with every contract field", async () => {
    const cards = parseJobCards(await fixture("search-lmia.html"))
    expect(cards.length).toBe(3)
    const c = cards[0]
    expect(c.id).toBe("50241782")
    expect(c.title).toBe("cook, institution")
    expect(c.company).toBe("La Casa Tropical Montessori")
    expect(c.location).toBe("Saint-Denis-de-Brompton (QC)")
    expect(c.date).toBe("2026-09-08")
    expect(c.url).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/50241782")
    expect(c.salary).toBe("$21.00 hourly")
    expect(c.lmia).toBe("requested")
    expect(c.workplace).toBe("On site")
    expect(c.jobNumber).toBe("3666490")
    for (const card of cards) {
      expect(card.id).toMatch(/^\d+$/)
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.lmia).toBe("requested")
    }
  })

  test("plain cards carry lmia null and never omit a contract key", async () => {
    const cards = parseJobCards(await fixture("search-plain.html"))
    expect(cards.length).toBe(2)
    for (const c of cards) {
      expect(Object.keys(c)).toEqual(
        expect.arrayContaining(["id", "title", "company", "location", "date", "url", "salary", "lmia", "workplace", "jobNumber"]),
      )
      expect(c.lmia).toBeNull()
    }
  })

  test("a malformed card does not break the rest", async () => {
    const html = (await fixture("search-plain.html")).replace(/<article id="article-(\d+)"/, '<article id="article-X"')
    expect(parseJobCards(html).length).toBe(1)
  })

  test("total results count", async () => {
    expect(parseTotal('<span class="found" id="results-count">1,312</span>')).toBe(1312)
    expect(parseTotal("<p>no count</p>")).toBeNull()
  })
})

describe("posting detail", () => {
  test("parses the RDFa posting page", async () => {
    const job = parseJobDetail(await fixture("posting-lmia.html"), "50241782", "2026-09-13")
    expect(job.title).toBe("cook, institution")
    expect(job.company).toBe("La Casa Tropical Montessori")
    expect(job.date).toBe("2026-09-08")
    expect(job.validThrough).toBe("2026-09-22")
    expect(job.location).toBe("Saint-Denis-de-Brompton (QC)")
    expect(job.salaryMin).toBe(21)
    expect(job.currency).toBe("CAD")
    expect(job.salaryUnit).toBe("HOUR")
    expect(job.workHours).toContain("30 hours per week")
    expect(job.employmentType).toContain("Permanent employment")
    expect(job.noc).toBe("63200")
    expect(job.vacancies).toBe(1)
    expect(job.lmia).toBe("requested")
    expect(job.description).toContain("Education:")
    expect(job.isActive).toBe(true)
    expect(job.url).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/50241782")
  })

  test("a posting past its validThrough is not active", async () => {
    const job = parseJobDetail(await fixture("posting-lmia.html"), "50241782", "2026-10-01")
    expect(job.isActive).toBe(false)
  })
})

describe("helpers", () => {
  test("dates", () => {
    expect(parseDate("Posted on September 08, 2026")).toBe("2026-09-08")
    expect(parseDate("March 5, 2026")).toBe("2026-03-05")
    expect(parseDate("2026-09-22 extra")).toBe("2026-09-22")
    expect(parseDate("no date")).toBeNull()
    expect(parseDate(null)).toBeNull()
  })
  test("lmia text and class", () => {
    expect(parseLmia("LMIA requested")).toBe("requested")
    expect(parseLmia("Approved LMIA")).toBe("approved")
    expect(parseLmia("LMIA requested - not yet approved")).toBe("requested")
    expect(parseLmia("LMIA application not approved")).toBe("requested")
    expect(parseLmia("anything", "jobLMIAflag submitted nopopup")).toBe("requested")
    expect(parseLmia("anything", "jobLMIAflag approved")).toBe("approved")
    expect(parseLmia("New")).toBeNull()
  })
  test("french dates", () => {
    expect(parseDate("Publié le 8 septembre 2026")).toBe("2026-09-08")
    expect(parseDate("1er août 2026")).toBe("2026-08-01")
    expect(parseDate("13 décembre 2026")).toBe("2026-12-13")
  })
  test("facets", () => {
    expect(jobageToFage(1)).toBe("2")
    expect(jobageToFage(14)).toBe("30")
    expect(jobageToFage(undefined)).toBeNull()
    expect(lmiaToFskl("requested")).toBe("101010")
    expect(lmiaToFskl("approved")).toBe("101020")
    expect(lmiaToFskl("any")).toBeNull()
    expect(() => lmiaToFskl("maybe")).toThrow()
  })
  test("search url", () => {
    const u = buildUrl({ query: "cook", location: "Toronto, ON", jobage: 7, lmia: "requested", noc: "63200", page: 2, format: "json" })
    expect(u).toContain("searchstring=cook")
    expect(u).toContain("locationstring=Toronto%2C+ON")
    expect(u).toContain("fage=30")
    expect(u).toContain("fskl=101010")
    expect(u).toContain("fn21=63200")
    expect(u).toContain("page=2")
    expect(u).toContain("sort=D")
  })
  test("ids", () => {
    expect(normalizeId("50241782")).toBe("50241782")
    expect(normalizeId("https://www.jobbank.gc.ca/jobsearch/jobposting/50241782;jsessionid=abc?source=x")).toBe("50241782")
    expect(normalizeId("nope")).toBeNull()
  })
  test("extractByAttr handles nesting", () => {
    const html = '<span property="a"><span property="b">x</span> y</span><span property="c">z</span>'
    expect(extractByAttr(html, "property", "a")).toBe('<span property="b">x</span> y')
    expect(extractByAttr(html, "property", "c")).toBe("z")
    expect(extractByAttr(html, "property", "d")).toBeNull()
  })
})
