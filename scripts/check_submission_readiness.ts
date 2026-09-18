/**
 * Submission readiness: the repo a judge clones must have no placeholders, a README whose claims match the tree
 * (test count, deck size, bench numbers), every mandatory file, and no kitchen files or keys in the history.
 * Exit 1 on any failure.
 *
 *   npm run check                 # CHECK_LINKS=1 also HEADs every external link in the README
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const fails: string[] = [];
const ok = (cond: unknown, msg: string) => {
  if (!cond) fails.push(msg);
  else console.log(`✔ ${msg}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const MUST = [
  "README.md",
  "DEMO.md",
  "ARCHITECTURE.md",
  "JUDGE.md",
  "LICENSE",
  ".env.example",
  "docs/RULES.md",
  "docs/BENCH.md",
  "docs/DX-REPORT.md",
  "docs/assets/icon.svg",
  "docs/assets/icon-animated.svg",
  "docs/assets/readme-hero-animated.svg",
  ".github/workflows/ci.yml",
  ".github/workflows/codeql.yml",
  ".github/workflows/gitleaks.yml",
  ".github/dependabot.yml",
  ".github/SECURITY.md",
  ".github/CONTRIBUTING.md",
  ".github/CODE_OF_CONDUCT.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  "scripts/seed.ts",
  "scripts/verify.ts",
  "scripts/reader.ts",
  "scripts/bench.ts",
  "packages/core/src/reader.ts",
  "packages/core/src/draw.ts",
  "packages/core/test/property.test.ts",
  "packages/core/test/boundary.test.ts",
  "packages/cli/src/cli.ts",
  "apps/web/app/page.tsx",
  "apps/web/app/judge/page.tsx",
  "apps/web/app/api/draw/route.ts",
  "apps/web/app/api/og/route.tsx",
  "fixtures/deck.json",
  "fixtures/dropped.json",
  "playwright.config.ts",
  "e2e/game.spec.ts",
];
for (const f of MUST) ok(existsSync(f), `exists: ${f}`);

const readme = read("README.md");
const judge = read("JUDGE.md");
for (const bad of ["TODO", "TBD", "lorem", "xxx", "PLACEHOLDER", "<your", "coming soon", "CLONE_SECONDS"])
  ok(!new RegExp(bad, "i").test(readme), `README has no "${bad}"`);
for (const section of ["Run it in under 10 minutes", "Nansen Integration", "Honesty", "Why only Nansen", "Honest limits"])
  ok(readme.includes(section), `README section: ${section}`);

// test count claimed = tests vitest runs (from the JSON reporter)
const claimed = Number((readme.match(/tests-(\d+)%20passing/) ?? [])[1] ?? 0);
const report = join(tmpdir(), `labelme-vitest-${process.pid}.json`);
let actual = -1,
  passed = -2;
try {
  execSync(`npx vitest run --reporter=json --outputFile=${report}`, { stdio: "ignore" });
  const v = JSON.parse(readFileSync(report, "utf8")) as { numTotalTests: number; numPassedTests: number };
  actual = v.numTotalTests;
  passed = v.numPassedTests;
} catch {
  fails.push("vitest JSON report could not be produced/parsed");
}
ok(passed === actual, `all ${actual} tests pass`);
ok(claimed === actual, `README badge claims ${claimed} tests; vitest runs ${actual}`);
ok(readme.includes(`**${actual} tests**`), `README prose states ${actual} tests`);
ok(judge.includes(`**${actual} tests**`), `JUDGE.md states ${actual} tests`);
ok(read("apps/web/lib/proof.ts").includes(`tests: ${actual},`), `apps/web/lib/proof.ts states ${actual} tests`);
const propertyRuns = Number((read("packages/core/test/property.test.ts").match(/NUM_RUNS = ([\d_]+)/) ?? ["", "0"])[1].replace(/_/g, ""));
const propertyCount = (read("packages/core/test/property.test.ts").match(/fc\.assert\(/g) ?? []).length;
const cases = propertyRuns * propertyCount;
ok(readme.includes(`property_cases-${cases.toLocaleString("en-US").replace(",", "%2C")}`), `README badge says ${cases.toLocaleString("en-US")} property cases`);
ok(read("apps/web/lib/proof.ts").includes(`propertyCases: ${cases.toLocaleString("en-US").replace(",", "_")},`), `proof.ts states ${cases} property cases`);

// deck claims
const cards = readdirSync("fixtures/cards").filter((f) => f.endsWith(".json")).length;
const deckFile = JSON.parse(read("fixtures/deck.json")) as { cards: number };
ok(deckFile.cards === cards, `deck.json says ${deckFile.cards} cards, ${cards} files on disk`);
ok(readme.includes(`deck-${cards}%2F${cards}`), `README badge says ${cards}/${cards} cards replay offline`);
ok(readme.includes(`${cards} cards`), `README prose states ${cards} cards`);
ok(judge.includes(`${cards} cards`), `JUDGE.md states ${cards} cards`);

// bench claims come from docs/BENCH.md, never typed
const bench = read("docs/BENCH.md");
const p50 = (bench.match(/\| \d+ draws \| \*\*([\d.]+) s\*\*/) ?? [])[1];
ok(p50 && readme.includes(`cold p50 ${p50} s`), `README quotes the bench cold p50 (${p50} s)`);
ok(p50 && read("apps/web/lib/proof.ts").includes(`coldP50s: "${p50}"`), `proof.ts quotes the bench cold p50`);

// kitchen and secrets never in the tree that is committed
const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n");
for (const bad of ["CLAUDE.md", "AGENTS.md", ".claude/", "specs/", "PROGRESS.md", "DEVIATIONS.md", "project.json", ".env", ".cache/", "spike-raw", "KICKOFF"])
  ok(!tracked.filter((f) => f !== ".env.example").some((f) => f === bad || f.startsWith(bad) || f.includes(`/${bad}`)), `not tracked: ${bad}`);
const leaks = execSync("git log -p --all | grep -c 'nsn_[A-Za-z0-9]\\{20,\\}' || true", { encoding: "utf8" }).trim();
ok(leaks === "0", `no API key in git history (${leaks} hits)`);
for (const f of readdirSync("fixtures/cards")) ok(!/nsn_[A-Za-z0-9]{20,}/.test(read(`fixtures/cards/${f}`)), `fixture clean: ${f.slice(0, 12)}…`);
// the offline flag must never sit in a reproduce command on the judge surfaces (R10)
for (const f of ["README.md", "JUDGE.md", "DEMO.md", "apps/web/app/judge/page.tsx"])
  ok(!/NANSEN_OFFLINE=1\s+npm run (labelme|dev|bench)/.test(read(f)), `${f}: no offline flag in a product command`);

for (const m of readme.matchAll(/docs\/(screenshots|assets)\/([\w.-]+)/g)) ok(existsSync(`docs/${m[1]}/${m[2]}`), `asset: ${m[1]}/${m[2]}`);

if (process.env.CHECK_LINKS === "1") {
  const links = [...new Set([...readme.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]))];
  for (const url of links) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow" });
      ok(res.status < 400, `link ${res.status}: ${url}`);
    } catch (e) {
      fails.push(`link failed: ${url} (${(e as Error).message})`);
    }
  }
}

console.log(
  fails.length
    ? `\n✖ ${fails.length} problem(s):\n${fails.map((f) => `  - ${f}`).join("\n")}`
    : `\nready: ${MUST.length} files, ${actual} tests, ${cards} cards, history clean`,
);
process.exit(fails.length ? 1 : 0);
