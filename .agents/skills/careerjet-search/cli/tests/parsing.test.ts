import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import * as S from "../src/source.ts"
import { isoDate, withinDays, matchesQuery, money } from "../src/lib.ts"

const fx = (name: string) => JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"))
const O = { page: 1, limit: 20, extra: {} as Record<string, string> }
const ISO = /^\d{4}-\d{2}-\d{2}$/

function contract(rows: S.Row[] | { id: string; title: string; url: string; date: string | null }[]) {
  expect(rows.length).toBeGreaterThan(0)
  for (const r of rows) {
    for (const k of ["id", "title", "company", "location", "date", "url"]) expect(k in r).toBe(true)
    expect(typeof r.id).toBe("string"); expect(r.id.length).toBeGreaterThan(0)
    expect(r.title.length).toBeGreaterThan(0)
    expect(r.url).toMatch(/^https?:\/\//)
    if (r.date) expect(r.date).toMatch(ISO)
  }
}

describe("lib", () => {
  test("dates, windows, query matching, money", () => {
    expect(isoDate("2026-09-01T14:37:00")).toBe("2026-09-01")
    expect(isoDate(1789320612)).toBe("2026-09-13")
    expect(isoDate("13/09/2026")).toBe("2026-09-13")
    expect(isoDate("nonsense")).toBeNull()
    expect(withinDays("2026-09-10", 7, new Date("2026-09-13T12:00:00Z"))).toBe(true)
    expect(withinDays("2026-08-10", 7, new Date("2026-09-13T12:00:00Z"))).toBe(false)
    expect(withinDays(null, 7)).toBe(false)
    expect(withinDays(null, undefined)).toBe(true)
    expect(matchesQuery("senior cook", "Senior Sous Chef", "cook restaurant")).toBe(true)
    expect(matchesQuery("nurse", "Cook")).toBe(false)
    expect(money(3000, 4000, "SGD", "monthly")).toBe("SGD 3,000–4,000 monthly")
    expect(money(null, null)).toBeNull()
  })
})

describe("careerjet", () => {
  // Shape from the v4 docs (careerjet.com/partners/api); no key on this machine.
  const body = { type: "JOBS", hits: 812, pages: 41, jobs: [{ title: "Cook", company: "Al Habtoor Hospitality", locations: "Dubai",
    date: "Fri, 12 Sep 2026 00:00:00 GMT", url: "https://www.careerjet.ae/jobad/ae1234567890abcdef", description: "We are hiring…",
    salary: "AED 3,000 - 4,000 per month", salary_currency_code: "AED", salary_min: "3000", salary_max: "4000", salary_type: "M" }] }
  test("rows get a stable id from the url", () => {
    const out = S.mapSearch(body, O)
    contract(out.results)
    expect(out.meta.total).toBe(812)
    expect(out.results[0].id).toMatch(/^cj-[0-9a-f]+$/)
    expect(out.results[0].company).toBe("Al Habtoor Hospitality")
    expect(out.results[0].date).toBe("2026-09-12")
    expect(S.mapSearch(body, O).results[0].id).toBe(out.results[0].id)
  })
  test("an API error body is surfaced, locales cover the corridors", () => {
    expect(() => S.mapSearch({ type: "ERROR", message: "bad key" }, O)).toThrow(/bad key/)
    for (const cc of ["PK", "AE", "SA", "QA", "KW", "OM", "BD", "PH", "VN", "GB"]) expect(S.LOCALES[cc]).toBeDefined()
    expect(S.validate({ ...O, query: "x", country: "ZW" })).not.toBeNull()
    expect(S.validate({ ...O, query: "x", page: 11 })).not.toBeNull()
    expect(S.validate({ ...O, query: "x", extra: { "user-ip": "not an ip" } })).not.toBeNull()
  })
})
