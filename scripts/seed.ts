/**
 * Record the deck (specs/seed-data.md): gather candidates from the sourcing lists, resolve one class per address,
 * then build cards LIVE — the four clue calls each (8 credits) — writing every raw Nansen response the card touched to
 * fixtures/cards/<address>.json together with the card. Responses are stored byte-for-byte and never edited; the key
 * is never written. `npm run verify` replays them offline and must reproduce every cardHash.
 *
 *   source ~/.config/nansen/meridian.env && npm run seed                 # up to TARGET per class (~500 credits)
 *   npm run seed -- --target 12 --class exchange                          # one class
 *   npm run seed -- --dry                                                 # gather + resolve only, no clue calls
 *
 * Responses already in .cache/ (spike, earlier seed runs) are reused at 0 credits and still land in the fixture.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CachedNansenClient,
  DiskCache,
  MemoryCache,
  nansen,
  gatherCandidates,
  buildCard,
  writeCardFixture,
  writeDeckFile,
  writeDropped,
  loadDeck,
  deckHash,
  listCardFixtures,
  DECK_CLASSES,
  CARDS_DIR,
  type CacheStore,
  type CacheEntry,
  type Dropped,
  classFromEntity,
  type LabelClass,
} from "../packages/core/src/index.js";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const TARGET = Number(opt("--target") ?? 12);
const ONLY = opt("--class") as LabelClass | undefined;
const DRY = args.includes("--dry");
const MIN_SM_TRADES = 5;
const apiKey = process.env.NANSEN_API_KEY ?? "";
const now = Date.now();

/** memory store for the fixture, backed by the disk cache so nothing already recorded is fetched again */
class Layered implements CacheStore {
  readonly mem = new MemoryCache();
  constructor(private disk: DiskCache) {}
  get(key: string): CacheEntry | undefined {
    const m = this.mem.get(key);
    if (m) return m;
    const d = this.disk.get(key);
    if (d) this.mem.set(key, d);
    return d;
  }
  set(key: string, entry: CacheEntry) {
    this.mem.set(key, entry);
    this.disk.set(key, entry);
  }
}
const disk = new DiskCache();
const gatherer = new CachedNansenClient(apiKey, { store: disk });
console.log("gathering candidates…");
const { candidates, dropped } = await gatherCandidates(gatherer, now);
const counts = Object.fromEntries(DECK_CLASSES.map((k) => [k, candidates.filter((c) => c.class === k).length]));
console.log(`candidates: ${JSON.stringify(counts)} · dropped ${dropped.length} · ${gatherer.creditsSpent} credits`);

const have = new Set(listCardFixtures().map((p) => p.split("/").pop()!.replace(".json", "")));
const deck0 = loadDeck();
const perClass = (k: LabelClass) => deck0.filter((c) => c.class === k).length;
const extraDropped: Dropped[] = [];
let credits = gatherer.creditsSpent,
  calls = gatherer.calls.filter((c) => !c.cached).length;

if (!DRY) {
  for (const cls of DECK_CLASSES) {
    if (ONLY && cls !== ONLY) continue;
    let n = perClass(cls);
    // smart-money: active traders first (they came from smart-money/dex-trades)
    const pool = candidates
      .filter((c) => c.class === cls && !have.has(c.address))
      .sort((a, b) => (a.source.endpoint === "smart-money/dex-trades" ? -1 : 0) - (b.source.endpoint === "smart-money/dex-trades" ? -1 : 0));
    for (const cand of pool) {
      if (n >= TARGET) break;
      const store = new Layered(disk);
      const client = new CachedNansenClient(apiKey, { store });
      const t0 = Date.now();
      let entity: string | null = null;
      // exchange / contract: the 1-credit tx-lookup label carries an entity or pool name for the reveal (2 credits)
      if (cls === "exchange" || cls === "contract") {
        try {
          const tx = await nansen.transactions(client, cand.address, now);
          const h = tx.data?.[0]?.transaction_hash;
          if (h) {
            const l = await nansen.txLookup(client, h);
            const d = l.data?.[0];
            const labels = [
              d?.from_address_label,
              d?.to_address_label,
              ...(d?.token_transfer_array ?? []).flatMap((t) => [t.from_address_label, t.to_address_label]),
            ].filter((x): x is string => !!x && x.trim().length > 0);
            const mine = labels.find((x) => x.toLowerCase().includes(cand.address.slice(2, 8)));
            entity = mine ?? null;
          }
        } catch {
          /* decoration only */
        }
      }
      // the entity label (Nansen's own) outranks the free-tier tag: "🤖 🏦 Luno: Wallet" tagged MultiSig is an exchange
      const finalClass = classFromEntity(entity, cand.class);
      const { card, failures } = await buildCard(client, { ...cand, class: finalClass, entity }, now);
      const ms = Date.now() - t0;
      if (finalClass !== cls) console.log(`  ↪ ${cand.address.slice(0, 10)} ${cls} → ${finalClass} by entity label ${entity}`);
      if (cls === "smart-money" && card.clues.pnl.trades < MIN_SM_TRADES) {
        extraDropped.push({
          address: cand.address,
          reason: `dormant Smart Money: ${card.clues.pnl.trades} trades in 30 d (< ${MIN_SM_TRADES})`,
          lists: ["smart-money"],
        });
        credits += client.creditsSpent;
        calls += client.calls.filter((c) => !c.cached).length;
        console.log(`  ✗ ${cls} ${cand.address.slice(0, 10)} dormant (${card.clues.pnl.trades} trades) · ${client.creditsSpent} cr`);
        continue;
      }
      if (card.clues.empty) {
        extraDropped.push({ address: cand.address, reason: "every clue section empty", lists: [cls] });
        credits += client.creditsSpent;
        console.log(`  ✗ ${cls} ${cand.address.slice(0, 10)} empty card · ${client.creditsSpent} cr`);
        continue;
      }
      const live = client.calls.filter((c) => !c.cached && c.ok);
      const failed = client.calls.filter((c) => !c.ok).map((c) => `${c.endpoint}: ${c.error}`);
      const path = writeCardFixture({
        edge: `${finalClass} via ${cand.source.endpoint}${cand.source.labelType ? ` ${cand.source.labelType}` : ""}${cand.source.token ? ` on ${cand.source.token}` : ""}`,
        recordedAt: card.recordedAt,
        now,
        live: { calls: live.length, credits: client.creditsSpent, ms, failed },
        responses: store.mem.entries(),
        card,
      });
      n++;
      credits += client.creditsSpent;
      calls += live.length;
      console.log(
        `  ✔ ${finalClass.padEnd(12)} ${card.address.slice(0, 10)} ${JSON.stringify(card.nansenLabel).padEnd(22)} ${entity ? `${entity} ` : ""}reader=${card.readerGuess === finalClass ? "✓" : card.readerGuess} · ${client.creditsSpent} cr · ${(ms / 1000).toFixed(1)}s${failures.length ? ` · ⚠ ${failures.map((f) => f.section).join(",")}` : ""} → ${path}`,
      );
    }
  }
}

const deck = loadDeck();
const byClass = Object.fromEntries(DECK_CLASSES.map((k) => [k, deck.filter((c) => c.class === k).length]));
writeDeckFile({
  version: 1,
  recordedAt: new Date(now).toISOString(),
  chain: "ethereum",
  cards: deck.length,
  byClass,
  deckHash: deckHash(deck),
  ids: deck.map((c) => c.id),
});
const allDropped = [...dropped, ...extraDropped];
const prev = existsSync(join("fixtures", "dropped.json"))
  ? (JSON.parse(await import("node:fs").then((m) => m.readFileSync(join("fixtures", "dropped.json"), "utf8"))) as Dropped[])
  : [];
const merged = new Map<string, Dropped>([...prev, ...allDropped].map((d) => [d.address, d]));
writeDropped([...merged.values()].sort((a, b) => a.address.localeCompare(b.address)));
const reader = deck.filter((c) => c.readerGuess === c.class).length;
console.log(
  `\ndeck: ${deck.length} cards ${JSON.stringify(byClass)} · reader ${reader}/${deck.length} · dropped ${merged.size} · this run ${credits} credits / ${calls} live calls · ${CARDS_DIR}`,
);
