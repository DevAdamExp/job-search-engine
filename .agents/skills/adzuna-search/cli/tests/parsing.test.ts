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

describe("adzuna", () => {
  // Shape from the published OpenAPI spec (developer.adzuna.com), not a live capture: no key on this machine.
  const body = { count: 1234, results: [{ id: 5119781234, title: "Registered <strong>Nurse</strong>", created: "2026-09-10T08:00:01Z",
    redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/5119781234?se=x", company: { display_name: "NHS Trust" },
    location: { display_name: "Leeds, West Yorkshire", area: ["UK", "West Yorkshire", "Leeds"] }, category: { label: "Healthcare & Nursing Jobs" },
    salary_min: 28000, salary_max: 34000, salary_is_predicted: "0", contract_time: "full_time", contract_type: "permanent", description: "…" }] }
  test("rows carry the mandatory attribution", () => {
    const out = S.mapSearch(body, O)
    contract(out.results)
    expect(out.meta.total).toBe(1234)
    expect(out.meta.attribution).toBe("Jobs by Adzuna")
    const r = out.results[0]
    expect(r.id).toBe("5119781234"); expect(r.title).toBe("Registered Nurse"); expect(r.company).toBe("NHS Trust")
    expect(r.location).toBe("Leeds, West Yorkshire"); expect(r.date).toBe("2026-09-10"); expect(r.salary).toBe("28,000–34,000 per year")
    expect(r.attribution).toBe("Jobs by Adzuna")
  })
  test("country and flag validation", () => {
    expect(S.validate({ ...O, query: "x", country: "PK" })).not.toBeNull()
    expect(S.validate({ ...O, query: "x", country: "GB" })).toBeNull()
    expect(S.validate({ ...O, query: "x", extra: { distance: "ten" } })).not.toBeNull()
    expect(S.COUNTRIES.size).toBe(19)
  })
})
