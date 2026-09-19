import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherCandidates } from "../src/sources.js";
import { drawCard } from "../src/draw.js";
import { writeCardFixture, readCardFixture, listCardFixtures, fixtureStore, loadDeck, deckExists, writeDeckFile, writeDropped } from "../src/fixtures.js";
import { CachedNansenClient, MemoryCache } from "../src/cache.js";
import { NansenClient } from "../src/client.js";
import { finishCard, buildCard } from "../src/card.js";
import { classFromEntity, classFromTag, isPoolTag, tagIsNeutral } from "../src/classes.js";
import { fakeClient, fakeFetch, clueRoutes, clues, ADDR, KEY } from "./helpers.js";

const holder = (address: string, label: string | null) => ({ address, address_label: label, value_usd: 1, token_amount: 1, ownership_percentage: 0 });

/** One token's sourcing lists modelled on the spike: an address may sit in several. */
function sourcingRoutes(endpoint: string, body: Record<string, unknown>) {
  if (endpoint === "smart-money/dex-trades")
    return {
      data: [
        { trader_address: ADDR("d1"), trader_address_label: "" },
        { trader_address: ADDR("d1"), trader_address_label: "" },
        { trader_address: ADDR("both"), trader_address_label: "x.eth" },
      ],
      pagination: {},
    };
  if (endpoint === "tgm/who-bought-sold")
    return {
      data: [holder(ADDR("r1"), null), holder(ADDR("r2"), "Token Millionaire"), holder(ADDR("r3"), "huck.eth"), holder(ADDR("d1"), null)],
      pagination: {},
    };
  if (endpoint === "tgm/holders") {
    const lt = body.label_type;
    if (lt === "smart_money") return { data: [holder(ADDR("s1"), "High Balance"), holder(ADDR("both"), ""), holder(ADDR("pf"), "")], pagination: {} };
    if (lt === "exchange")
      return { data: [holder(ADDR("e1"), "Token Billionaire"), holder(ADDR("both"), ""), holder(ADDR("pool"), "UniswapV2")], pagination: {} };
    if (lt === "public_figure") return { data: [holder(ADDR("pf"), "fatmac.eth*")], pagination: {} };
    // the excluded page: Nansen drops exchange / smart-money / public-figure members server-side
    if ((body.filters as { exclude_smart_money_labels?: string[] } | undefined)?.exclude_smart_money_labels)
      return { data: [holder(ADDR("w1"), "Token Millionaire"), holder(ADDR("safe"), "Proxy"), holder(ADDR("r3"), "huck.eth")], pagination: {} };
    return {
      data: [
        holder(ADDR("w1"), "Token Millionaire"),
        holder(ADDR("e1"), "Token Billionaire"),
        holder(ADDR("pool"), "UniswapV2"),
        holder(ADDR("safe"), "Proxy"),
        holder(ADDR("r3"), "huck.eth"),
      ],
      pagination: {},
    };
  }
  throw new Error("unexpected " + endpoint);
}

describe("gatherCandidates — one class per address, by precedence", () => {
  it("resolves the spike's precedence rules and drops the ambiguous ones with reasons", async () => {
    const c = fakeClient(sourcingRoutes);
    const { candidates, dropped } = await gatherCandidates(c, Date.now(), { PEPE: "0xpepe" });
    const cls = Object.fromEntries(candidates.map((x) => [x.address, x.class]));
    expect(cls[ADDR("d1")]).toBe("smart-money"); // dex-trades trader, also a who-bought row → smart-money wins
    expect(cls[ADDR("s1")]).toBe("smart-money");
    expect(cls[ADDR("e1")]).toBe("exchange"); // exchange list beats the wealth tag
    expect(cls[ADDR("w1")]).toBe("whale");
    expect(cls[ADDR("pool")]).toBe("contract"); // structural tag beats the exchange list
    expect(cls[ADDR("safe")]).toBe("contract");
    expect(cls[ADDR("r1")]).toBe("regular");
    expect(cls[ADDR("r3")]).toBe("regular"); // ENS tag is neutral
    expect(cls[ADDR("r2")]).toBeUndefined(); // wealth-tagged buyer is not "regular" and not a whale (not on the plain page)
    expect(dropped.find((d) => d.address === ADDR("both"))?.reason).toMatch(/both the Exchange and the Smart Money/);
    expect(dropped.find((d) => d.address === ADDR("pf"))?.reason).toMatch(/Public Figure/);
    expect(candidates.find((x) => x.address === ADDR("e1"))?.source).toMatchObject({
      endpoint: "tgm/holders",
      labelType: "exchange",
      token: "PEPE",
      tag: "Token Billionaire",
    });
    expect(candidates.find((x) => x.address === ADDR("d1"))?.source.endpoint).toBe("smart-money/dex-trades");
    expect(c.creditsSpent).toBe(5 + 4 * 5 + 1);
  });
  it("sends the exclusion of all 17 label groups on the regular and plain-whale paths", async () => {
    const c = fakeClient(sourcingRoutes);
    await gatherCandidates(c, Date.now(), { PEPE: "0xpepe" });
    const wb = c.calls.find((x) => x.endpoint === "tgm/who-bought-sold")!;
    expect((wb.body.filters as { exclude_smart_money_labels: string[] }).exclude_smart_money_labels).toHaveLength(17);
    const sm = c.calls.find((x) => x.endpoint === "tgm/holders" && x.body.label_type === "smart_money")!;
    expect((sm.body.filters as { include_smart_money_labels: string[] }).include_smart_money_labels).toContain("Fund");
    const plain = c.calls.find((x) => x.endpoint === "tgm/holders" && !x.body.label_type)!;
    expect(plain.body.filters).toBeUndefined();
  });
});

describe("drawCard — one fresh card, live, streamed", () => {
  const routes = (endpoint: string, body: Record<string, unknown>) =>
    endpoint.startsWith("profiler/") ? clueRoutes("whale")(endpoint) : sourcingRoutes(endpoint, body);
  it("draws a whale from a plain page, emits one call event per Nansen call and a card event, 13 credits", async () => {
    const c = fakeClient(routes);
    const events: string[] = [];
    const { card } = await drawCard(c, { class: "whale", seed: "s", onProgress: (e) => events.push(e.type) });
    expect(card.class).toBe("whale");
    expect(card.address).toBe(ADDR("w1"));
    expect(card.source).toMatchObject({ endpoint: "tgm/holders", labelType: "all_holders" });
    expect((c.calls[0].body.filters as { exclude_smart_money_labels: string[] }).exclude_smart_money_labels).toHaveLength(17);
    expect(events.filter((e) => e === "call")).toHaveLength(5);
    expect(events.at(-1)).toBe("card");
    expect(c.creditsSpent).toBe(13);
  });
  it("every call is announced by a start event first, paired by seq — the rail's pending row resolves into the landed Call", async () => {
    const c = fakeClient(routes);
    const seen: { type: string; seq: number; endpoint: string }[] = [];
    await drawCard(c, {
      class: "whale",
      seed: "s",
      onProgress: (e) => {
        if (e.type === "start") seen.push({ type: "start", seq: e.start.seq, endpoint: e.start.endpoint });
        if (e.type === "call") seen.push({ type: "call", seq: e.call.seq ?? -1, endpoint: e.call.endpoint });
      },
    });
    const starts = seen.filter((x) => x.type === "start");
    const calls = seen.filter((x) => x.type === "call");
    expect(starts).toHaveLength(5);
    expect(calls).toHaveLength(5);
    for (const k of calls) {
      const i = seen.findIndex((x) => x.type === "start" && x.seq === k.seq);
      expect(i, `${k.endpoint} has a start`).toBeGreaterThanOrEqual(0);
      expect(seen[i].endpoint).toBe(k.endpoint);
      expect(i).toBeLessThan(seen.indexOf(k));
    }
    expect(c.onStart).toBeUndefined();
  });
  it("REGRESSION (audit 2026-09-19): clue rows are emitted as each call lands, not as one batch after the slowest", async () => {
    const slow = async (endpoint: string, body: Record<string, unknown>) => {
      if (endpoint === "profiler/address/counterparties") await new Promise((r) => setTimeout(r, 300));
      return routes(endpoint, body);
    };
    const c = new NansenClient(KEY, {
      rps: 1000,
      fetchImpl: async (url, init) =>
        fakeFetch(routes)(url, init).then(async (r) => (await slow(String(url).replace("https://api.nansen.ai/api/v1/", ""), {}), r)),
    });
    const stamps: { endpoint: string; at: number }[] = [];
    const t0 = Date.now();
    await drawCard(c, { class: "whale", seed: "s", onProgress: (e) => e.type === "call" && stamps.push({ endpoint: e.call.endpoint, at: Date.now() - t0 }) });
    const fast = stamps.filter((s) => /pnl|balance/.test(s.endpoint)).map((s) => s.at);
    const cp = stamps.find((s) => s.endpoint === "profiler/address/counterparties")!.at;
    expect(fast).toHaveLength(3);
    for (const at of fast) expect(cp - at).toBeGreaterThanOrEqual(200);
    expect(c.onCall).toBeUndefined(); // the hook is restored after the draw
  });
  it("smart-money draws come from the live trade feed (active by construction)", async () => {
    const c = fakeClient(routes);
    const { card } = await drawCard(c, { class: "smart-money", seed: "s" });
    expect(card.source.endpoint).toBe("smart-money/dex-trades");
    expect([ADDR("d1"), ADDR("both")]).toContain(card.address);
  });
  it("skips addresses already in the deck and tries another token page; gives up honestly when every page is spent", async () => {
    const c = fakeClient(routes);
    const { card } = await drawCard(c, { class: "exchange", seed: "s", exclude: new Set([ADDR("e1")]) });
    expect(card.address).not.toBe(ADDR("e1"));
    expect(card.class).toBe("exchange");
    const c2 = fakeClient(routes);
    await expect(drawCard(c2, { class: "whale", seed: "s", exclude: new Set([ADDR("w1")]), tokens: { A: "0xa", B: "0xb", C: "0xc" } })).rejects.toThrow(
      /no unseen whale/,
    );
    expect(c2.calls.filter((x) => x.endpoint === "tgm/holders")).toHaveLength(3);
  });
  it("contract draws only deal unambiguous pool tags, never a MultiSig/Proxy (may be an exchange wallet)", async () => {
    const c = fakeClient(routes);
    const { card } = await drawCard(c, { class: "contract", seed: "s" });
    expect(card.address).toBe(ADDR("pool"));
  });
  it("REGRESSION (review pass 1): four failed clue calls are an error, not a card of four unavailable panels", async () => {
    const c = fakeClient((e, b) => (e.startsWith("profiler/") ? new Response('{"error":"Burn address not allowed"}', { status: 422 }) : routes(e, b)));
    const events: string[] = [];
    await expect(drawCard(c, { class: "whale", seed: "s", onProgress: (e) => events.push(e.type) })).rejects.toThrow(/no clues/);
    expect(events).not.toContain("card");
    expect(events.filter((e) => e === "call")).toHaveLength(5);
  });
  it("a sourcing failure surfaces as an error after the call event", async () => {
    const c = fakeClient((e, b) => (e === "tgm/holders" ? new Response("down", { status: 503 }) : routes(e, b)));
    const events: string[] = [];
    await expect(drawCard(c, { class: "exchange", onProgress: (e) => events.push(e.type) })).rejects.toThrow(/503/);
    expect(events).toContain("call");
    expect(c.calls[0].ok).toBe(false);
  });
});

describe("fixtures — write, list, read, replay", () => {
  it("round-trips a card fixture and replays it offline to the same hash with zero network", async () => {
    const dir = mkdtempSync(join(tmpdir(), "labelme-fx-"));
    const store = new MemoryCache();
    const live = new CachedNansenClient(KEY, { fetchImpl: fakeFetch(clueRoutes("regular")), rps: 1000, store });
    const now = Date.parse("2026-09-18T10:00:00Z");
    const { card } = await buildCard(
      live,
      { address: ADDR(9), class: "regular", nansenLabel: "", source: { endpoint: "tgm/who-bought-sold", labelType: null, token: "PEPE", tag: "" } },
      now,
    );
    const path = writeCardFixture(
      { edge: "test", recordedAt: card.recordedAt, now, live: { calls: 4, credits: 8, ms: 1, failed: [] }, responses: store.entries(), card },
      dir,
    );
    expect(listCardFixtures(dir)).toEqual([path]);
    const f = readCardFixture(path);
    expect(JSON.stringify(f)).not.toContain(KEY);
    let fetched = 0;
    const replay = new CachedNansenClient(KEY, {
      fetchImpl: fakeFetch(() => {
        fetched++;
        return {};
      }),
      store: fixtureStore(f),
      offline: true,
    });
    const again = await buildCard(
      replay,
      { address: f.card.address, class: f.card.class, nansenLabel: f.card.nansenLabel, entity: f.card.entity, source: f.card.source },
      f.now,
    );
    expect(again.card.cardHash).toBe(f.card.cardHash);
    expect(fetched).toBe(0);
    expect(replay.creditsSpent).toBe(0);
    expect(loadDeck(dir)).toHaveLength(1);
    expect(deckExists(dir)).toBe(true);
    expect(deckExists(join(dir, "nope"))).toBe(false);
    expect(listCardFixtures(join(dir, "nope"))).toEqual([]);
    expect(writeDeckFile({ version: 1, recordedAt: "x", chain: "ethereum", cards: 1, byClass: {}, deckHash: "h", ids: [] }, dir)).toMatch(/deck\.json$/);
    expect(writeDropped([], dir)).toMatch(/dropped\.json$/);
  });
  it("the committed deck loads, has ≥ 40 cards, ≥ 8 per class, unique ids, and never carries a key", () => {
    const deck = loadDeck();
    expect(deck.length).toBeGreaterThanOrEqual(40);
    for (const k of ["smart-money", "exchange", "whale", "contract", "regular"]) expect(deck.filter((c) => c.class === k).length, k).toBeGreaterThanOrEqual(8);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
    expect(JSON.stringify(deck)).not.toMatch(/nsn_[A-Za-z0-9]{20}/);
    for (const c of deck)
      expect(c.cardHash).toBe(
        finishCard({ address: c.address, class: c.class, nansenLabel: c.nansenLabel, entity: c.entity, source: c.source }, c.clues, c.now).cardHash,
      );
  });
  it("REGRESSION (audit 2026-09-19): every committed answer key is what the code's own rules would deal today", () => {
    // if this fails, `npm run seed` would re-class a card and silently change the recording's round (meridian1933)
    for (const c of loadDeck()) {
      expect(classFromEntity(c.entity, c.class), `${c.address} entity ${c.entity}`).toBe(c.class);
      if (c.class === "regular") expect(tagIsNeutral(c.nansenLabel), `${c.address} tag ${c.nansenLabel}`).toBe(true);
      if (c.class === "whale") expect(classFromTag(c.nansenLabel), `${c.address} tag ${c.nansenLabel}`).toBe("whale");
      if (c.class === "contract") expect(classFromTag(c.nansenLabel) === "contract" || isPoolTag(c.entity), `${c.address}`).toBe(true);
      if (c.class === "smart-money") expect(c.clues.pnl.trades, `${c.address} dormant`).toBeGreaterThanOrEqual(5);
      expect(c.clues.empty, `${c.address} empty`).toBe(false);
    }
  });
  it("a card built from empty clues is still a valid card", () => {
    const c = finishCard(
      { address: ADDR(1), class: "whale", nansenLabel: "", source: { endpoint: "t", labelType: null, token: null, tag: "" } },
      clues({ empty: true }),
      0,
    );
    expect(c.tell).toBeTypeOf("string");
  });
});
