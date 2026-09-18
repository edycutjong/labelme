/**
 * Score the house reader (packages/core/src/reader.ts) on the committed deck: accuracy + confusion matrix.
 * Zero network. The number in README comes from here, never typed.
 *
 *   npm run reader [--json]
 */
import { loadDeck, read, DECK_CLASSES, READER, type LabelClass } from "../packages/core/src/index.js";

const deck = loadDeck();
const m = new Map<LabelClass, Map<LabelClass, number>>();
for (const a of DECK_CLASSES) m.set(a, new Map(DECK_CLASSES.map((b) => [b, 0])));
let right = 0;
for (const c of deck) {
  const g = read(c.clues).guess;
  m.get(c.class)!.set(g, (m.get(c.class)!.get(g) ?? 0) + 1);
  if (g === c.class) right++;
}
const perClass = Object.fromEntries(DECK_CLASSES.map((k) => [k, { seen: deck.filter((c) => c.class === k).length, right: m.get(k)!.get(k) ?? 0 }]));
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ cards: deck.length, right, accuracy: deck.length ? right / deck.length : 0, perClass, thresholds: READER }, null, 2));
} else {
  console.log(`house reader: ${right}/${deck.length} cards (${deck.length ? Math.round((100 * right) / deck.length) : 0}%)\n`);
  console.log(`${"truth / guess".padEnd(14)}${DECK_CLASSES.map((k) => k.padStart(13)).join("")}`);
  for (const a of DECK_CLASSES) console.log(`${a.padEnd(14)}${DECK_CLASSES.map((b) => String(m.get(a)!.get(b) ?? 0).padStart(13)).join("")}`);
  console.log(`\nthresholds: ${JSON.stringify(READER)}`);
}
