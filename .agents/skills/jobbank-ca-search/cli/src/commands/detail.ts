import { POSTING_URL, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accept a bare posting id or a Job Bank posting URL (with or without ;jsessionid / query). */
export function normalizeId(input: string): string | null {
  const url = input.match(/\/jobsearch\/jobposting\/(\d+)/i)
  if (url) return url[1]
  const bare = input.match(/^\d{5,}$/)
  if (bare) return input
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a Job Bank posting id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(`${POSTING_URL}/${id}`)
    if (!html) {
      writeError("Posting not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id)
    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Apply by: ${job.validThrough}` : "",
        job.salary ? `Salary: ${job.salary}${job.workHours ? ` / ${job.workHours}` : ""}` : "",
        job.employmentType ? `Terms: ${job.employmentType}` : "",
        job.noc ? `NOC: ${job.noc}` : "",
        job.vacancies !== null ? `Vacancies: ${job.vacancies}` : "",
        job.lmia ? `LMIA: ${job.lmia}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
