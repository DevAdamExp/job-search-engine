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

describe("reed", () => {
  // Shape from reed.co.uk/developers/jobseeker; no key on this machine.
  const body = { totalResults: 321, results: [{ jobId: 55512345, employerName: "Care Group Ltd", jobTitle: "Registered Nurse", locationName: "Leeds",
    minimumSalary: 30000, maximumSalary: 36000, currency: "GBP", expirationDate: "10/10/2026", date: "12/09/2026", jobDescription: "<p>Join us</p>",
    jobUrl: "https://www.reed.co.uk/jobs/registered-nurse/55512345", applications: 3 }] }
  test("rows parse Reed's dd/mm/yyyy dates", () => {
    const out = S.mapSearch(body, O)
    contract(out.results)
    expect(out.meta.total).toBe(321)
    const r = out.results[0]
    expect(r.id).toBe("55512345"); expect(r.date).toBe("2026-09-12"); expect(r.deadline).toBe("2026-10-10")
    expect(r.salary).toBe("GBP 30,000–36,000 per year"); expect(r.company).toBe("Care Group Ltd")
  })
  test("UK only; ids", () => {
    expect(S.validate({ ...O, query: "x", country: "IE" })).not.toBeNull()
    expect(S.validate({ ...O, query: "x", country: "GB" })).toBeNull()
    expect(S.normalizeId("https://www.reed.co.uk/jobs/registered-nurse/55512345")).toBe("55512345")
  })
})
