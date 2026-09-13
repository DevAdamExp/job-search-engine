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

describe("himalayas", () => {
  test("search rows follow the contract, countries allowed are kept", () => {
    const out = S.mapSearch(fx("search.json"), O)
    contract(out.results)
    expect(out.meta.total).toBe(33)
    const r = out.results[0]
    expect(r.id).toBe("companies/diana-health/jobs/fractional-women-s-health-recruiter-q4")
    expect(r.title).toBe("Fractional Women's Health Recruiter (Q4)")
    expect(r.company).toBe("Diana Health")
    expect(r.location).toBe("Remote (worldwide)")
    expect(r.remote).toBe(true)
    expect(r.date).toBe("2026-09-13")
    expect(r.deadline).toBe("2026-11-12")
    expect(typeof r.description).toBe("string")
    expect(Array.isArray(r.countries_allowed)).toBe(true)
  })
  test("location label lists up to three countries", () => {
    const row = S.toRow({ title: "T", applicationLink: "https://himalayas.app/companies/a/jobs/b", locationRestrictions: ["United Kingdom", "Ireland", "Germany", "France"], pubDate: 1789284738 })
    expect(row.location).toBe("Remote (United Kingdom, Ireland, Germany +1)")
  })
})
