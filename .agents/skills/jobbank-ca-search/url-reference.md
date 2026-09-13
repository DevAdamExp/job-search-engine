# Job Bank (Canada) — endpoint reference

Recorded 2026-09-13 from live pages. Update these anchors if the markup changes.

## Search (HTML, server-rendered)

`GET https://www.jobbank.gc.ca/jobsearch/jobsearch`

| Parameter | Meaning |
|---|---|
| `searchstring` | keywords |
| `locationstring` | place string, e.g. `Toronto, ON` (may be empty) |
| `sort` | `D` newest first (`M` relevance) |
| `page` | 1-indexed; 25 results per page |
| `fage` | posting age facet: `2` (last 2 days), `30` (last 30 days), `%2B30` (older than 30) |
| `fskl` | LMIA facet: `101010` LMIA requested, `101020` approved LMIA; prefix `¬` (`%C2%AC`) excludes |
| `fn21` | NOC 2021 code facet, e.g. `21232` |
| `fprov` | province facet (not used by the CLI) |

Result card anchors (one per posting):

```
<article id="article-<postingId>" class="action-buttons">
  <a href="/jobsearch/jobposting/<postingId>;jsessionid=...?source=searchresults" class="resultJobItem">
    <h3 class="title">
      <span class="flag"> <span class="new">New</span><span class="telework">On site</span>
        <span class="jobLMIAflag submitted nopopup"> LMIA requested </span> </span>
      <span class="noctitle"> cook, institution </span>
    </h3>
    <ul class="list-unstyled">
      <li class="date">September 08, 2026 </li>
      <li class="business">La Casa Tropical Montessori</li>
      <li class="location"> ... Saint-Denis-de-Brompton (QC) </li>
      <li class="salary"> Salary $21.00 hourly</li>
      <li class="source"> ... Job number: 3666490</li>
    </ul>
  </a>
```

Total count: `<span class="found" id="results-count">312</span>`.

## Posting (HTML + schema.org RDFa)

`GET https://www.jobbank.gc.ca/jobsearch/jobposting/<postingId>` (404 page when unknown)

| Field | Anchor |
|---|---|
| title | `<h1 property="name"> <span property="title">…</span>` |
| LMIA | `<span class="jobLMIAflag job-marker"> … <span class="text">LMIA requested</span>` inside the `<h1>` |
| posted | `<span property="datePosted"> Posted on September 08, 2026 </span>` |
| employer | `<span property="hiringOrganization"> <span property="name"> <a …>Employer</a>` |
| apply by | `<span property="validThrough">2026-09-22 …` |
| salary | `<span property="baseSalary" typeof="MonetaryAmount"><span property="value"><span property="currency" content="CAD">$</span><span property="minValue" content="21.00">21.00</span><span property="unitText">HOUR</span> hourly</span> / <span property='workHours'> 30 hours per week</span></span>` |
| terms | `<span property="employmentType">Permanent employment<span>Full time</span></span>` |
| location | `<span property="joblocation"> … <span property="addressLocality">…</span>, <span property="addressRegion">QC</span>` |
| NOC | `<span class="noc-no">NOC 63200</span>` |
| vacancies | `<span>1 vacancy</span>` |
| description | `<… property="description">plain text…</…>` |

## Feed (Atom) — not used

`/jobsearch/jobSearchRSSfeed?searchstring=&locationstring=` answered once with an Atom feed and
404 on every later probe (with or without `sort`, `page`, `rows`, `fage`, `fskl`); treated as
unreliable.

## robots.txt

```
User-agent: *
Crawl-delay: 5
```
