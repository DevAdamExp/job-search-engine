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

describe("arbeidsplassen-no", () => {
  test("search rows follow the contract with NAV facts", () => {
    const out = S.mapSearch(fx("search.json"), O)
    contract(out.results)
    expect(out.meta.total).toBe(306)
    const r = out.results[0]
    expect(r.id).toBe("c44fd531-7108-4ae6-9834-e22278778d0b")
    expect(r.title).toBe("Kjøkkenmedarbeider/ kokk")
    expect(r.company).toBe("FAUSKE KOMMUNE STORKJØKKEN")
    expect(r.location).toBe("FAUSKE, Nordland")
    expect(r.date).toBe("2026-08-31")
    expect(r.deadline).toBe("2026-09-27")
    expect(r.languages).toBe("Norsk")
    expect(r.url).toBe("https://arbeidsplassen.nav.no/stillinger/stilling/c44fd531-7108-4ae6-9834-e22278778d0b")
  })
  test("limit is applied client-side (the API ignores size)", () => {
    expect(S.mapSearch(fx("search.json"), { ...O, limit: 1 }).results.length).toBe(1)
    expect(S.normalizeId("https://arbeidsplassen.nav.no/stillinger/stilling/c44fd531-7108-4ae6-9834-e22278778d0b")).toBe("c44fd531-7108-4ae6-9834-e22278778d0b")
  })
})
