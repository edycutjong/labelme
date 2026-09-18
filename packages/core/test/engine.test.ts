import { describe, it, expect } from "vitest";
import { tell, fmtUsd, pct } from "../src/tell.js";
import { read, READER } from "../src/reader.js";
import { finishCard, buildCard, cardHash, cardId, face, cardProjection } from "../src/card.js";
import { makeRound, score, rng, shuffle, normalizeSeed, randomSeed, deckHash, ROUND_SIZE, DECK_CLASSES } from "../src/round.js";
import { clues, fakeClient, clueRoutes, ADDR } from "./helpers.js";
import type { Card } from "../src/card.js";
import type { LabelClass } from "../src/classes.js";

const mix = (o: Partial<Record<string, number>>) => ({ pool: 0, entity: 0, contract: 0, wealth: 0, activity: 0, ens: 0, other: 0, unlabelled: 0, ...o });

describe("fmtUsd / pct", () => {
  it("compact dollars with a real minus sign; percentages rounded; null → dash", () => {
    expect(fmtUsd(37_848_904_619)).toBe("$38B");
    expect(fmtUsd(1_274_194_001)).toBe("$1.3B");
    expect(fmtUsd(28_171_038)).toBe("$28M");
    expect(fmtUsd(5_297_692)).toBe("$5.3M");
    expect(fmtUsd(35_191)).toBe("$35K");
    expect(fmtUsd(1046)).toBe("$1.0K");
    expect(fmtUsd(-24535)).toBe("−$25K");
    expect(fmtUsd(80)).toBe("$80");
    expect(pct(0.667)).toBe("67%");
    expect(pct(null)).toBe("—");
  });
});

describe("tell — one line per class from the numbers", () => {
  it("exchange names size, counterparties and the absence of trades", () => {
    const t = tell("exchange", clues({ balance: { ok: true, tokens: 100, tokensCapped: true, totalUsd: 9.37e9, topShare: 0.41, topSymbol: "USDT", stableShare: 0.32 }, counterparties: { ok: true, count: 21, countCapped: false, interactions: 245, topOutShare: 0.47, mix: mix({ wealth: 1 }), counts: mix({ wealth: 21 }) } }));
    expect(t).toBe("100+ tokens worth $9.4B · 21 counterparties in 30 d, 100% of that volume with wealth-tagged or exchange wallets · 0 DEX trades — money moves in and out, nobody is trading: an exchange wallet");
  });
  it("whale names the one position", () => {
    expect(tell("whale", clues({ balance: { ok: true, tokens: 1, tokensCapped: false, totalUsd: 29_952_734, topShare: 1, topSymbol: "PEPE", stableShare: 0 } }))).toMatch(/^PEPE is 100% of a \$30M balance · 0 trades · 1 counterparty in 30 d — a big holder sitting still: a whale$/);
  });
  it("smart money: active vs dormant wording", () => {
    const active = tell("smart-money", clues({ pnl: { ok: true, realizedUsd: 11892, realizedPct: 0.041, winRate: 0.667, trades: 472, tokensTraded: 6, top: [] }, counterparties: { ok: true, count: 9, countCapped: false, interactions: 472, topOutShare: 0.5, mix: mix({ activity: 0.97, unlabelled: 0.03 }), counts: mix({}) } }));
    expect(active).toMatch(/^472 trades in 30 d · win rate 67% · realised \$12K across 6 tokens · 97% of flow through DEX pools and routers — a trader Nansen tracks as Smart Money$/);
    expect(tell("smart-money", clues())).toMatch(/sat still$/);
  });
  it("contract: a pool speaks of traffic, a multisig of signers", () => {
    const pool = tell("contract", clues({ counterparties: { ok: true, count: 50, countCapped: true, interactions: 37652, topOutShare: 0.54, mix: mix({ wealth: 0.9, activity: 0.1 }), counts: mix({}) }, balance: { ok: true, tokens: 19, tokensCapped: false, totalUsd: 28_171_038, topShare: 0.501, topSymbol: "PEPE", stableShare: 0 } }), "UniswapV2");
    expect(pool).toBe("37,652 interactions from 50+ counterparties in 30 d · 19 tokens split 50% / 50% · no trades of its own — traffic without a trader: a liquidity pool");
    const safe = tell("contract", clues({ counterparties: { ok: true, count: 1, countCapped: false, interactions: 6, topOutShare: 1, mix: mix({ wealth: 1 }), counts: mix({}) } }), "Gnosis Safe Proxy");
    expect(safe).toMatch(/code with signers, not a person: a Gnosis Safe Proxy$/);
    expect(tell("contract", clues(), "")).toMatch(/a contract$/);
  });
  it("regular says which label groups it is NOT in; public-figure has a fixed line", () => {
    expect(tell("regular", clues({ pnl: { ok: true, realizedUsd: 9, realizedPct: 0, winRate: 1, trades: 1, tokensTraded: 1, top: [] } }))).toMatch(/^1 trade · 1 token worth \$100 · 1 counterparty in 30 d — none of Nansen's label groups: a regular wallet$/);
    expect(tell("public-figure", clues())).toMatch(/Public Figure/);
  });
});

describe("read — the house rule", () => {
  const big = { ok: true, tokens: 100, tokensCapped: true, totalUsd: 9.37e9, topShare: 0.41, topSymbol: "USDT", stableShare: 0.32 };
  it("pool: traffic and few tokens", () => {
    expect(read(clues({ counterparties: { ok: true, count: 50, countCapped: true, interactions: 37652, topOutShare: 0.5, mix: mix({}), counts: mix({}) }, balance: { ...big, tokens: 19, tokensCapped: false } })).guess).toBe("contract");
    expect(read(clues({ counterparties: { ok: true, count: 50, countCapped: true, interactions: 1055, topOutShare: 0.5, mix: mix({}), counts: mix({}) }, balance: { ...big, tokens: 7, tokensCapped: false } })).guess).toBe("contract");
  });
  it("exchange: traffic + many tokens is an exchange, not a pool (Luno, Bybit)", () => {
    expect(read(clues({ counterparties: { ok: true, count: 50, countCapped: true, interactions: 5020, topOutShare: 0.25, mix: mix({ wealth: 0.3, unlabelled: 0.45 }), counts: mix({}) }, balance: { ...big, totalUsd: 94e6 } })).guess).toBe("exchange");
    expect(read(clues({ counterparties: { ok: true, count: 21, countCapped: false, interactions: 245, topOutShare: 0.47, mix: mix({ wealth: 1 }), counts: mix({}) }, balance: big })).guess).toBe("exchange");
    expect(read(clues({ counterparties: { ok: true, count: 1, countCapped: false, interactions: 1, topOutShare: null, mix: mix({ unlabelled: 1 }), counts: mix({}) }, balance: { ...big, tokens: 51, tokensCapped: false, totalUsd: 3.39e9, topShare: 0.9 } })).guess).toBe("exchange");
  });
  it("whale: one position of a $1M+ balance, few trades", () => {
    expect(read(clues({ balance: { ok: true, tokens: 1, tokensCapped: false, totalUsd: 29_952_734, topShare: 1, topSymbol: "PEPE", stableShare: 0 } })).guess).toBe("whale");
    expect(read(clues({ balance: { ok: true, tokens: 1, tokensCapped: false, totalUsd: 29_952_734, topShare: 1, topSymbol: "PEPE", stableShare: 0 }, pnl: { ok: true, realizedUsd: 1, realizedPct: 0, winRate: 0.5, trades: 5019, tokensTraded: 2, top: [] } })).guess).not.toBe("whale");
  });
  it("smart money: many trades across many tokens; a busy two-token buyer stays regular", () => {
    expect(read(clues({ pnl: { ok: true, realizedUsd: -4761, realizedPct: -0.1, winRate: 0.185, trades: 458, tokensTraded: 27, top: [] } })).guess).toBe("smart-money");
    expect(read(clues({ pnl: { ok: true, realizedUsd: 521, realizedPct: 0.1, winRate: 1, trades: 25, tokensTraded: 2, top: [] } })).guess).toBe("regular");
    expect(read(clues()).guess).toBe("regular");
  });
  it("every read carries a reason and thresholds are frozen numbers", () => {
    expect(read(clues()).because).toMatch(/\d/);
    expect(READER.smartMoney.minTrades).toBe(25);
    expect(READER.contract.maxTokens).toBe(20);
  });
});

describe("card — hash, id, projection, face", () => {
  const input = { address: ADDR("A").toUpperCase(), class: "whale" as LabelClass, nansenLabel: "Token Millionaire", entity: null, source: { endpoint: "tgm/holders", labelType: "all_holders", token: "PEPE", tag: "Token Millionaire" } };
  it("finishCard lower-cases the address, hashes the projection, and the hash ignores reader/cost/time", () => {
    const now = Date.parse("2026-09-18T10:00:00Z");
    const a = finishCard(input, clues(), now);
    const b = finishCard(input, clues(), now + 5_000_000);
    expect(a.address).toBe(ADDR("A").toLowerCase());
    expect(a.cardHash).toBe(b.cardHash);
    expect(a.cardHash).toHaveLength(64);
    expect(a.id).toBe(cardId(a.address));
    expect(a.id).toHaveLength(10);
    expect(JSON.stringify(cardProjection(a))).not.toContain("readerGuess");
    expect(a.readerGuess).toBe("regular");
    expect(a.tell).toMatch(/whale/);
  });
  it("a change in any clue or in the class changes the hash", () => {
    const a = finishCard(input, clues(), 0);
    const b = finishCard(input, clues({ balance: { ...clues().balance, totalUsd: 101 } }), 0);
    const c = finishCard({ ...input, class: "exchange" }, clues(), 0);
    expect(new Set([a.cardHash, b.cardHash, c.cardHash]).size).toBe(3);
    expect(cardHash(a)).toBe(a.cardHash);
  });
  it("face() carries clues and hash but never the class, label, entity, address or tell", () => {
    const f = face(finishCard({ ...input, entity: "🏦 Binance" }, clues(), 0));
    expect(Object.keys(f).sort()).toEqual(["cardHash", "chain", "clues", "id"]);
    expect(JSON.stringify(f)).not.toMatch(/whale|Billionaire|Binance|0x0000/);
  });
  it("buildCard runs the four calls and returns failures", async () => {
    const c = fakeClient(clueRoutes("whale"));
    const { card, failures } = await buildCard(c, input, Date.now());
    expect(failures).toEqual([]);
    expect(card.class).toBe("whale");
    expect(card.readerGuess).toBe("whale");
    expect(c.calls).toHaveLength(4);
  });
});

function deck(n: number, classes: LabelClass[] = DECK_CLASSES): Card[] {
  return Array.from({ length: n }, (_, i) => finishCard({ address: ADDR(i + 1), class: classes[i % classes.length], nansenLabel: "", source: { endpoint: "t", labelType: null, token: null, tag: "" } }, clues({ balance: { ...clues().balance, totalUsd: i } }), 0));
}

describe("round — deterministic, balanced, seed-safe", () => {
  const d = deck(60);
  it("same seed → same round; different seed → different round; ten unique ids from the deck", () => {
    const a = makeRound(d, "meridian"),
      b = makeRound(d, "meridian"),
      c = makeRound(d, "other");
    expect(a).toEqual(b);
    expect(a.cardIds).not.toEqual(c.cardIds);
    expect(new Set(a.cardIds).size).toBe(ROUND_SIZE);
    const ids = new Set(d.map((x) => x.id));
    for (const id of a.cardIds) expect(ids.has(id)).toBe(true);
    expect(a.deckHash).toBe(deckHash(d));
  });
  it("every class appears twice in a 5-class deck of 60", () => {
    const r = makeRound(d, "x");
    const byId = new Map(d.map((c) => [c.id, c]));
    const counts = r.cardIds.map((id) => byId.get(id)!.class).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
    expect(Object.values(counts)).toEqual([2, 2, 2, 2, 2]);
  });
  it("file order does not matter: a reversed deck gives the same round", () => {
    expect(makeRound([...d].reverse(), "z").cardIds).toEqual(makeRound(d, "z").cardIds);
  });
  it("a deck smaller than the round size deals what it has; a one-class deck still deals", () => {
    expect(makeRound(deck(4), "s").cardIds).toHaveLength(4);
    expect(makeRound(deck(12, ["whale"]), "s").cardIds).toHaveLength(10);
  });
  it("normalizeSeed strips everything but [A-Za-z0-9_-] and caps at 32; empty → '' → makeRound falls back to 'meridian'", () => {
    expect(normalizeSeed(" héllo/wörld?x=1 ")).toBe("hllowrldx1");
    expect(normalizeSeed("a".repeat(50))).toHaveLength(32);
    expect(normalizeSeed(null)).toBe("");
    expect(makeRound(d, "").seed).toBe("meridian");
    expect(randomSeed()).toMatch(/^[0-9a-f]{8}$/);
  });
  it("rng is a deterministic stream in [0,1); shuffle is a permutation", () => {
    const a = rng("s"),
      b = rng("s");
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    expect(shuffle([1, 2, 3, 4, 5], rng("q")).sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("score counts correct guesses, streaks, per-class and the house", () => {
    const r = makeRound(d, "meridian");
    const byId = new Map(d.map((c) => [c.id, c]));
    const guesses: Record<string, LabelClass> = {};
    for (const [i, id] of r.cardIds.entries()) guesses[id] = i < 3 ? byId.get(id)!.class : "whale";
    const s = score(r, byId, guesses);
    expect(s.total).toBe(10);
    expect(s.correct).toBeGreaterThanOrEqual(3);
    expect(s.streakBest).toBeGreaterThanOrEqual(3);
    expect(Object.values(s.perClass).reduce((a, x) => a + x.seen, 0)).toBe(10);
    expect(s.house).toBeGreaterThanOrEqual(0);
    expect(score(r, byId, {}).correct).toBe(0);
  });
});
