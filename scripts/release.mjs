// release.mjs [--dry-run] — the release.yml algorithm, run locally (for when GitHub Actions is unavailable).
// Node only, no dependencies. Same rules as the workflow:
//   last v* tag → Conventional Commits since it → feat: minor · fix:/perf: patch · "!" / BREAKING CHANGE major · else no release
//   → scripts/bump-version.mjs bumps every package.json + the lockfile → `npm ci --ignore-scripts` proves the lockfile
//   → commit "chore(release): vX.Y.Z" → annotated tag → push → `gh release create vX.Y.Z --generate-notes`.
// Refuses to run on a dirty tree, off `main`, or when main is not level with origin/main.
import { execFileSync } from "node:child_process";
import process from "node:process";

const dry = process.argv.includes("--dry-run");
const sh = (cmd, args, opts = {}) => (execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) ?? "").trim();
const git = (...args) => sh("git", args);
const say = (s) => process.stdout.write(s + "\n");
const fail = (s) => {
  process.stderr.write(`release: ${s}\n`);
  process.exit(1);
};

// ── preflight ──────────────────────────────────────────────────────────────
if (git("status", "--porcelain")) fail("working tree is not clean — commit or stash first");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") fail(`on '${branch}', releases are cut from main`);
git("fetch", "origin", "main", "--tags", "--quiet");
if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) fail("main is not level with origin/main — pull or push first");

// ── 1. next version from Conventional Commits since the last v* tag ────────
let last = "";
try {
  last = git("describe", "--tags", "--abbrev=0", "--match", "v*");
} catch {
  /* no tag yet */
}
const range = last ? `${last}..HEAD` : "HEAD";
const log = git("log", "--format=%B", range);
if (!log.replace(/\s/g, "")) {
  say(`No commits since ${last || "the beginning"}.`);
  process.exit(0);
}
const lines = log.split("\n");
let bump = "none";
if (lines.some((l) => /^[a-z]+(\(.+\))?!:/.test(l) || /^BREAKING CHANGE:/.test(l))) bump = "major";
else if (lines.some((l) => /^feat(\(.+\))?:/.test(l))) bump = "minor";
else if (lines.some((l) => /^(fix|perf)(\(.+\))?:/.test(l))) bump = "patch";
if (bump === "none") {
  say(`No releasable commits since ${last || "the beginning"} (feat/fix/perf/breaking only).`);
  process.exit(0);
}
let [ma, mi, pa] = (last ? last.slice(1) : "0.0.0").split(".").map(Number);
if (bump === "major") [ma, mi, pa] = [ma + 1, 0, 0];
else if (bump === "minor") [mi, pa] = [mi + 1, 0];
else pa += 1;
const next = `v${ma}.${mi}.${pa}`;
say(`Bump: ${bump}  ${last || "none"} -> ${next}`);
say(
  git("log", "--format=%h %s", range)
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n"),
);
if (dry) {
  say(`(dry run) would bump every package.json + lockfile to ${next.slice(1)}, commit "chore(release): ${next}", tag, push and publish.`);
  process.exit(0);
}

// ── 2. bump every package.json + the lockfile, prove npm ci still resolves ─
say(sh("node", ["scripts/bump-version.mjs", next.slice(1)]));
sh("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: ["ignore", "ignore", "pipe"] });
say(git("diff", "--stat", "--", "package.json", "package-lock.json", "apps/*/package.json", "packages/*/package.json"));

// ── 3. commit, tag, push, publish ─────────────────────────────────────────
git("add", "-A");
git("commit", "-q", "-m", `chore(release): ${next}`);
git("tag", "-a", next, "-m", next);
git("push", "--quiet", "origin", "HEAD:main");
git("push", "--quiet", "origin", next);
say(sh("gh", ["release", "create", next, "--generate-notes", "--title", next]));
say(`Released ${next} (${bump}).`);
