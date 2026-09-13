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

describe("mycareersfuture-sg", () => {
  test("search rows follow the contract with MCF facts", () => {
    const out = S.mapSearch(fx("search.json"), O)
    contract(out.results)
    expect(out.meta.total).toBe(1217)
    const r = out.results[0]
    expect(r.id).toBe("aed0cc6218d61d4afc9a3e284949d952")
    expect(r.title).toBe("Cook")
    expect(r.company).toBe("BAKER & COOK PTE. LTD.")
    expect(r.location).toBe("Singapore")
    expect(r.date).toBe("2026-09-02")
    expect(r.deadline).toBe("2026-10-02")
    expect(r.salary).toBe("SGD 2,180–3,100 monthly")
    expect(r.job_post_id).toBe("MCF-2026-1537760")
    expect(String(r.url)).toContain("mycareersfuture.gov.sg/job/")
  })
  test("jobage filters client-side; detail strips html; ids", () => {
    expect(S.mapSearch(fx("search.json"), { ...O, jobage: 1 }).results.length).toBe(0)
    const d = fx("detail.json")
    expect(S.toRow(d).id).toBe(d.uuid)
    expect(S.normalizeId("https://www.mycareersfuture.gov.sg/job/x-aed0cc6218d61d4afc9a3e284949d952")).toBe("aed0cc6218d61d4afc9a3e284949d952")
    expect(S.normalizeId("nope")).toBeNull()
  })
})
