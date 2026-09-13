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

describe("themuse", () => {
  test("search rows follow the contract; keyword and country filters are client-side", () => {
    const all = S.mapSearch(fx("search.json"), { ...O, location: "London, United Kingdom" })
    contract(all.results)
    expect(all.meta.total).toBe(8316)
    expect(all.results[0].id).toBe("18087566")
    expect(all.results[0].title).toBe("EMEA Regulatory Change Manager")
    expect(all.results[0].company).toBe("Bank of America")
    expect(all.results[0].location).toBe("London, United Kingdom")
    expect(all.results[0].date).toBe("2025-03-23")
    const kw = S.mapSearch(fx("search.json"), { ...O, query: "regulatory change" })
    expect(kw.results.map((r) => r.id)).toEqual(["18087566"])
    // a bare --country keeps only rows whose location names that country (multi-location US rows drop out)
    const gb = S.mapSearch(fx("search.json"), { ...O, country: "GB" })
    expect(gb.results.every((r) => String(r.location).includes("United Kingdom"))).toBe(true)
    expect(gb.results.length).toBeLessThan(all.results.length)
  })
  test("validation and ids", () => {
    expect(S.validate({ ...O })).not.toBeNull()
    expect(S.validate({ ...O, country: "GB" })).toBeNull()
    expect(S.normalizeId("https://www.themuse.com/jobs/x/y-18087566")).toBe("18087566")
    expect(S.toRow(fx("detail.json")).id).toBe("18087566")
  })
})
