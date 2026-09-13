import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.ts"

// Offline: every case fails validation before any network call.
describe("cli flag validation", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("USAGE")
  })
  test("unknown command", async () => {
    const r = await runCLI(["frobnicate"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS")
  })
  test("unknown flag", async () => {
    const r = await runCLI(["search", "-q", "cook", "--bogus", "1"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).error).toContain("--bogus")
  })
  test("search needs a query, location or noc", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS")
  })
  test("jobage, lmia, noc, format are validated", async () => {
    for (const args of [
      ["search", "-q", "cook", "--jobage", "3"],
      ["search", "-q", "cook", "--lmia", "maybe"],
      ["search", "-q", "cook", "--noc", "abc"],
      ["search", "-q", "cook", "--format", "xml"],
      ["search", "-q", "cook", "--page", "0"],
      ["detail", "50241782", "--format", "table"],
    ]) {
      const r = await runCLI(args)
      expect(r.exitCode).toBe(1)
      expect(JSON.parse(r.stderr).code).toBe("BAD_ARGS")
    }
  })
  test("detail needs an id", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
  })
  test("detail rejects an unparsable id before fetching", async () => {
    const r = await runCLI(["detail", "not-an-id"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})
