import { describe, expect, test } from "bun:test"
import { runCLI, stderrJson } from "./helpers"

// Validation happens before any network call, so this file is offline.
describe("jobtech-se-search flag validation", () => {
  test("no command prints help and exits 1", async () => {
    const r = await runCLI([])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toContain("USAGE")
  })
  test("unknown flag is refused (a dropped filter would silently widen the search)", async () => {
    const r = await runCLI(["search", "--query", "x", "--bogus", "1"])
    expect(r.exitCode).toBe(1)
    expect(stderrJson(r).code).toBe("UNKNOWN_FLAG")
  })
  test("bad jobage / page / limit / country / format", async () => {
    expect(stderrJson(await runCLI(["search", "-q", "x", "--jobage", "3"])).code).toBe("BAD_ARG")
    expect(stderrJson(await runCLI(["search", "-q", "x", "--page", "0"])).code).toBe("BAD_ARG")
    expect(stderrJson(await runCLI(["search", "-q", "x", "--limit", "1.5"])).code).toBe("BAD_ARG")
    expect(stderrJson(await runCLI(["search", "-q", "x", "--country", "GBR"])).code).toBe("BAD_ARG")
    expect(stderrJson(await runCLI(["search", "-q", "x", "--format", "xml"])).code).toBe("BAD_ARGS")
    expect(stderrJson(await runCLI(["detail"])).code).toBe("BAD_ARGS")
  })
})
