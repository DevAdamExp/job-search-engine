# jobbank-ca-cli

Zero-dependency Bun CLI for Canada's official Job Bank (www.jobbank.gc.ca), including the
LMIA (foreign-worker) facet. See `../SKILL.md` for flags and examples, `../url-reference.md`
for the parsing anchors.

```bash
bun install            # dev types only
bun run typecheck
bun test               # offline fixture tests
bun run src/cli.ts search -q "cook" --lmia requested --format table
```

Respect the board's `Crawl-delay: 5`.
