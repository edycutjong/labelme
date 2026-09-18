/** Numbers the home page and /judge quote. Each is checked against its source by scripts/check_submission_readiness.ts. */
export const PROOF = {
  tests: 96, // vitest count (readiness script reads vitest's JSON reporter)
  propertyCases: 12_000, // 6 properties × 2,000 runs (packages/core/test/property.test.ts NUM_RUNS)
  coldP50s: "2.1", // docs/BENCH.md cold p50
  creditsPerDraw: "13", // docs/BENCH.md: 13 for a class-list draw, 9 for a regular draw (mean 12.2); up to 23 when sourcing pages are retried
  cloneSeconds: 9, // timed clean clone from GitHub → first round (6 s) + verify + tests (9 s), 2026-09-18
};
