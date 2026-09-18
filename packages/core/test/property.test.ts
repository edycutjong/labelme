import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { read } from "../src/reader.js";
import { tell } from "../src/tell.js";
import { finishCard } from "../src/card.js";
import { makeRound, normalizeSeed, ROUND_SIZE, DECK_CLASSES } from "../src/round.js";
import { counterpartyClass } from "../src/classes.js";
import { extractBalance, extractCounterparties, extractPnl, MIX_KEYS, type Clues } from "../src/clues.js";
import { ADDR } from "./helpers.js";
import type { LabelClass } from "../src/classes.js";

export const NUM_RUNS = 2_000;

const money = fc.oneof(fc.constant(null), fc.double({ min: -1e12, max: 1e12, noNaN: true }));
const share = fc.oneof(fc.constant(null), fc.double({ min: 0, max: 1, noNaN: true }));
const mixArb = fc.record(Object.fromEntries(MIX_KEYS.map((k) => [k, fc.double({ min: 0, max: 1, noNaN: true })])));
const cluesArb: fc.Arbitrary<Clues> = fc.record({
  pnl: fc.record({ ok: fc.boolean(), realizedUsd: money, realizedPct: share, winRate: share, trades: fc.nat(100_000), tokensTraded: fc.nat(1000), top: fc.array(fc.record({ symbol: fc.string({ maxLength: 12 }), roi: share, pnlUsd: money }), { maxLength: 5 }) }),
  trades: fc.record({ ok: fc.boolean(), rows: fc.array(fc.record({ symbol: fc.string({ maxLength: 12 }), pnlUsd: money, buys: fc.nat(1e6), sells: fc.nat(1e6) }), { maxLength: 5 }) }),
  balance: fc.record({ ok: fc.boolean(), tokens: fc.nat(1000), tokensCapped: fc.boolean(), totalUsd: fc.double({ min: 0, max: 1e12, noNaN: true }), topShare: share, topSymbol: fc.oneof(fc.constant(null), fc.string({ maxLength: 12 })), stableShare: share }),
  counterparties: fc.record({ ok: fc.boolean(), count: fc.nat(1000), countCapped: fc.boolean(), interactions: fc.nat(1e7), topOutShare: share, mix: mixArb, counts: mixArb }),
  empty: fc.boolean(),
}) as fc.Arbitrary<Clues>;
const classArb = fc.constantFrom<LabelClass>(...DECK_CLASSES, "public-figure");

describe("property: engine never throws and stays deterministic", () => {
  it("read() returns a deck class with a reason for any clues", () => {
    fc.assert(
      fc.property(cluesArb, (c) => {
        const r = read(c);
        expect(DECK_CLASSES).toContain(r.guess);
        expect(r.because.length).toBeGreaterThan(0);
        expect(read(c)).toEqual(r);
      }),
      { numRuns: NUM_RUNS },
    );
  });
  it("tell() is a non-empty single line for every class and any clues/tag", () => {
    fc.assert(
      fc.property(cluesArb, classArb, fc.string({ maxLength: 40 }), (c, k, tag) => {
        const t = tell(k, c, tag);
        expect(t.length).toBeGreaterThan(10);
        expect(t).not.toContain("\n");
        expect(t).not.toMatch(/NaN|undefined|Infinity/);
      }),
      { numRuns: NUM_RUNS },
    );
  });
  it("finishCard: same inputs → same hash; the hash never depends on `now` or the reader", () => {
    fc.assert(
      fc.property(cluesArb, classArb, fc.nat(1e13), fc.nat(1e13), (c, k, n1, n2) => {
        const input = { address: ADDR(7), class: k, nansenLabel: "x", entity: null, source: { endpoint: "t", labelType: null, token: null, tag: "" } };
        expect(finishCard(input, c, n1).cardHash).toBe(finishCard(input, c, n2).cardHash);
      }),
      { numRuns: NUM_RUNS },
    );
  });
  it("makeRound: any seed string → ≤ 10 unique ids from the deck, identical on replay, and the seed survives a URL", () => {
    const deck = Array.from({ length: 23 }, (_, i) => finishCard({ address: ADDR(i), class: DECK_CLASSES[i % 5], nansenLabel: "", source: { endpoint: "t", labelType: null, token: null, tag: "" } }, { pnl: { ok: true, realizedUsd: i, realizedPct: null, winRate: null, trades: 0, tokensTraded: 0, top: [] }, trades: { ok: true, rows: [] }, balance: { ok: true, tokens: 0, tokensCapped: false, totalUsd: 0, topShare: null, topSymbol: null, stableShare: null }, counterparties: { ok: true, count: 0, countCapped: false, interactions: 0, topOutShare: null, mix: Object.fromEntries(MIX_KEYS.map((k) => [k, 0])) as Clues["counterparties"]["mix"], counts: Object.fromEntries(MIX_KEYS.map((k) => [k, 0])) as Clues["counterparties"]["mix"] }, empty: true }, 0));
    const ids = new Set(deck.map((c) => c.id));
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (seed) => {
        const r = makeRound(deck, seed);
        expect(r.cardIds.length).toBeLessThanOrEqual(ROUND_SIZE);
        expect(new Set(r.cardIds).size).toBe(r.cardIds.length);
        for (const id of r.cardIds) expect(ids.has(id)).toBe(true);
        expect(makeRound(deck, seed)).toEqual(r);
        expect(encodeURIComponent(r.seed)).toBe(r.seed);
        expect(normalizeSeed(r.seed)).toBe(r.seed);
      }),
      { numRuns: NUM_RUNS },
    );
  });
  it("extractors never throw on arbitrary shapes and shares stay in [0,1]", () => {
    const anyRow = fc.record({ token_symbol: fc.oneof(fc.constant(null), fc.string()), value_usd: money, counterparty_address_label: fc.oneof(fc.constant(null), fc.array(fc.string())), interaction_count: fc.oneof(fc.constant(null), fc.integer()), total_volume_usd: money, volume_out_usd: money });
    fc.assert(
      fc.property(fc.array(anyRow, { maxLength: 60 }), fc.oneof(fc.constant(undefined), fc.boolean()), (rows, last) => {
        const b = extractBalance(rows, last);
        const k = extractCounterparties(rows, last);
        for (const v of [b.topShare, b.stableShare, k.topOutShare, ...MIX_KEYS.map((x) => k.mix[x])]) if (v !== null) expect(v >= 0 && v <= 1).toBe(true);
        expect(b.totalUsd).toBeGreaterThanOrEqual(0);
        expect(extractPnl({ top5_tokens: null, traded_times: null, traded_token_count: null, realized_pnl_usd: null, realized_pnl_percent: null, win_rate: null }).ok).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
  it("counterpartyClass is total over arbitrary label lists", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.array(fc.string({ maxLength: 30 }))), (labels) => {
        expect(["pool", "contract", "wealth", "activity", "ens", "entity", "other", "unlabelled"]).toContain(counterpartyClass(labels));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
