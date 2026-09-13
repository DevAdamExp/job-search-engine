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

describe("arbeitnow", () => {
  test("feed rows follow the contract; keyword + country filters are client-side", () => {
    const de = S.mapSearch(fx("page1.json"), { ...O, country: "DE" })
    contract(de.results)
    expect(de.meta.has_more).toBe(true)
    expect(de.results[0].id).toBe("senior-sous-chefin-hamburg-10392")
    expect(de.results[0].company).toBe("The Bellezza Group")
    expect(de.results[0].location).toBe("Hamburg, Hamburg, Deutschland")
    expect(de.results[0].date).toBe("2026-09-13")
    expect(S.mapSearch(fx("page1.json"), { ...O, query: "sous chef" }).results.length).toBe(1)
    expect(S.mapSearch(fx("page1.json"), { ...O, query: "sous chef", country: "GB" }).results.length).toBe(0)
    expect(S.mapSearch(fx("page1.json"), { ...O, location: "Berlin" }).results.every((r) => String(r.location).includes("Berlin"))).toBe(true)
  })
  test("validation and ids", () => {
    expect(S.validate({ ...O })).not.toBeNull()
    expect(S.validate({ ...O, query: "x", extra: { "visa-sponsorship": "yes" } })).not.toBeNull()
    expect(S.normalizeId("https://www.arbeitnow.com/jobs/companies/the-bellezza-group/senior-sous-chefin-hamburg-10392")).toBe("senior-sous-chefin-hamburg-10392")
    expect(S.normalizeId("senior-sous-chefin-hamburg-10392")).toBe("senior-sous-chefin-hamburg-10392")
  })
})
