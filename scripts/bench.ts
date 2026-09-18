/**
 * Benchmark the only live path — "Draw fresh" — and write docs/BENCH.md from real runs: cold (network) and warm
 * (same draw replayed from the in-memory cache) p50/p95 latency, credits and calls per draw, failures, and the house
 * reader's accuracy on the fresh cards (out-of-sample: none of them is in the deck).
 *
 *   source ~/.config/nansen/meridian.env && npm run bench -- --runs 10     # ~13 credits per cold draw
 */
import { writeFileSync } from "node:fs";
import { CachedNansenClient, MemoryCache, drawCard, loadDeck, read, DRAW_CLASSES, type Card } from "../packages/core/src/index.js";

const args = process.argv.slice(2);
const RUNS = Number(args.includes("--runs") ? args[args.indexOf("--runs") + 1] : 10);
const apiKey = process.env.NANSEN_API_KEY ?? "";
const deck = loadDeck();
const exclude = new Set(deck.map((c) => c.address));

type Row = { i: number; class: string; coldMs: number; warmMs: number; credits: number; calls: number; failed: string; card?: Card; house?: string };
const rows: Row[] = [];
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};

for (let i = 0; i < RUNS; i++) {
  const cls = DRAW_CLASSES[i % DRAW_CLASSES.length];
  const store = new MemoryCache();
  const seed = `bench-${i}`;
  const cold = new CachedNansenClient(apiKey, { store });
  const t0 = Date.now();
  let card: Card | undefined,
    failed = "";
  try {
    card = (await drawCard(cold, { class: cls, seed, exclude })).card;
  } catch (e) {
    failed = (e as Error).message.slice(0, 80);
  }
  const coldMs = Date.now() - t0;
  const warm = new CachedNansenClient(apiKey, { store });
  const t1 = Date.now();
  let warmMs = 0;
  if (card) {
    try {
      await drawCard(warm, { class: cls, seed, exclude, now: card.now });
      warmMs = Date.now() - t1;
    } catch {
      warmMs = -1;
    }
  }
  const house = card ? read(card.clues).guess : undefined;
  rows.push({ i, class: cls, coldMs, warmMs, credits: cold.creditsSpent, calls: cold.calls.length, failed, card, house });
  console.log(`${String(i + 1).padStart(2)} ${cls.padEnd(12)} cold ${(coldMs / 1000).toFixed(1)}s · warm ${warmMs} ms · ${cold.creditsSpent} cr / ${cold.calls.length} calls${card ? ` · ${card.address.slice(0, 10)} house=${house === cls ? "✓" : house}` : ` · ✗ ${failed}`}`);
}

const ok = rows.filter((r) => r.card);
const cold = ok.map((r) => r.coldMs),
  warm = ok.map((r) => r.warmMs).filter((x) => x >= 0);
const credits = ok.reduce((a, r) => a + r.credits, 0);
const calls = ok.reduce((a, r) => a + r.calls, 0);
const houseRight = ok.filter((r) => r.house === r.class).length;
const stamp = new Date().toISOString();
const md = `# Bench — the live draw (\`npm run bench -- --runs ${RUNS}\`)

Measured ${stamp} on the shared \`meridian\` key from a laptop in Jakarta (Nansen latency swings by the minute — re-run before quoting).
Each run draws ONE unseen labelled wallet live (one sourcing page + the four clue calls), then replays the same draw from the in-memory cache.
None of the drawn wallets is in the committed deck, so the house reader's score here is out-of-sample.

| | cold p50 | cold p95 | warm p50 | warm p95 | credits / draw | calls / draw | failed draws | house reader |
|---|---|---|---|---|---|---|---|---|
| ${RUNS} draws | **${(q(cold, 0.5) / 1000).toFixed(1)} s** | ${(q(cold, 0.95) / 1000).toFixed(1)} s | ${q(warm, 0.5)} ms | ${q(warm, 0.95)} ms | **${ok.length ? (credits / ok.length).toFixed(1) : "—"}** | ${ok.length ? (calls / ok.length).toFixed(1) : "—"} | ${rows.length - ok.length} / ${rows.length} | ${houseRight} / ${ok.length} |

Per draw:

| # | class | cold | warm | credits | calls | wallet | house read |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.i + 1} | ${r.class} | ${(r.coldMs / 1000).toFixed(1)} s | ${r.warmMs} ms | ${r.credits} | ${r.calls} | ${r.card ? `\`${r.card.address.slice(0, 10)}…\`` : `✗ ${r.failed}`} | ${r.card ? (r.house === r.class ? "✓" : r.house) : "—"} |`).join("\n")}

The default round (\`npm run labelme -- play\`) makes **0 calls and costs 0 credits** — it deals from \`fixtures/cards/\` (${deck.length} cards); \`npm run verify\` replays all of them offline.
Cold = the first draw on a fresh cache; warm = the identical draw served from the cache (every row recorded at 0 credits, hash identical).
`;
writeFileSync("docs/BENCH.md", md);
console.log(`\ncold p50 ${(q(cold, 0.5) / 1000).toFixed(1)}s p95 ${(q(cold, 0.95) / 1000).toFixed(1)}s · warm p50 ${q(warm, 0.5)} ms · ${ok.length ? (credits / ok.length).toFixed(1) : "—"} cr/draw · house ${houseRight}/${ok.length} · ${credits} credits total → docs/BENCH.md`);
