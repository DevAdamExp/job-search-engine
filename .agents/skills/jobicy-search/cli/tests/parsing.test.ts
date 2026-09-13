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

describe("jobicy", () => {
  test("rows follow the contract with region + salary", () => {
    const out = S.mapSearch(fx("search.json"), O)
    contract(out.results)
    const r = out.results[0]
    expect(r.id).toBe("150933")
    expect(r.title).toBe("Senior Software Engineer (Elixir)")
    expect(r.company).toBe("Sona")
    expect(r.location).toBe("Remote (Europe, UK)")
    expect(r.salary).toBe("GBP 85,000–105,000 yearly")
    expect(r.date).toBe("2026-08-17")
  })
  test("regions and validation", () => {
    expect(S.geoFor("GB")).toBe("uk"); expect(S.geoFor("PK")).toBe("apac"); expect(S.geoFor("XX")).toBeUndefined()
    expect(S.validate({ ...O, country: "XX" })).not.toBeNull()
    expect(S.mapSearch(fx("search.json"), { ...O, query: "elixir" }).results.length).toBe(1)
    expect(S.normalizeId("https://jobicy.com/jobs/150933-senior-software-engineer-elixir")).toBe("150933")
  })
})
