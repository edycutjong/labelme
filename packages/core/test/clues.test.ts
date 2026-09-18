import { describe, it, expect } from "vitest";
import { extractPnl, extractTrades, extractBalance, extractCounterparties, fetchClues, MIX_KEYS } from "../src/clues.js";
import { fakeClient, clueRoutes, ADDR } from "./helpers.js";

describe("extractPnl", () => {
  it("rounds dollars to integers and rates to 3 decimals; keeps up to 5 top tokens", () => {
    const p = extractPnl({
      top5_tokens: Array.from({ length: 7 }, (_, i) => ({ token_symbol: `T${i}`, realized_pnl: 10.6, realized_roi: 0.12345 })),
      traded_token_count: 6,
      traded_times: 472,
      realized_pnl_usd: 11892.3,
      realized_pnl_percent: 0.04123,
      win_rate: 0.66666,
    });
    expect(p).toMatchObject({ ok: true, realizedUsd: 11892, realizedPct: 0.041, winRate: 0.667, trades: 472, tokensTraded: 6 });
    expect(p.top).toHaveLength(5);
    expect(p.top[0]).toEqual({ symbol: "T0", roi: 0.123, pnlUsd: 11 });
  });
  it("0 trades → win rate and pct are null (no data), not 0 (lost everything)", () => {
    const p = extractPnl({ top5_tokens: [], traded_token_count: 0, traded_times: 0, realized_pnl_usd: 0, realized_pnl_percent: 0, win_rate: 0 });
    expect(p.winRate).toBeNull();
    expect(p.realizedPct).toBeNull();
    expect(p.realizedUsd).toBe(0);
  });
  it("a failed call → ok:false with zeros", () => {
    expect(extractPnl(undefined)).toMatchObject({ ok: false, trades: 0, top: [] });
  });
  it("tolerates null top5_tokens and NaN-ish fields", () => {
    const p = extractPnl({
      top5_tokens: null,
      traded_token_count: null,
      traded_times: undefined,
      realized_pnl_usd: Number.NaN,
      realized_pnl_percent: null,
      win_rate: null,
    });
    expect(p).toMatchObject({ ok: true, realizedUsd: null, trades: 0, tokensTraded: 0, top: [] });
  });
});

describe("extractTrades", () => {
  it("parses string counts, caps at 5 rows, truncates long symbols", () => {
    const t = extractTrades(
      Array.from({ length: 6 }, (_, i) => ({ token_symbol: "VERYLONGSYMBOLNAME" + i, pnl_usd_realised: 1.6, nof_buys: "12", nof_sells: 3 })),
    );
    expect(t.rows).toHaveLength(5);
    expect(t.rows[0]).toEqual({ symbol: "VERYLONGSYMB", pnlUsd: 2, buys: 12, sells: 3 });
  });
  it("failed → ok:false; null data → ok:false", () => {
    expect(extractTrades(undefined, false).ok).toBe(false);
    expect(extractTrades(null).ok).toBe(false);
  });
});

describe("extractBalance", () => {
  it("token count, total, top share/symbol, stable share; page cap flag from is_last_page:false", () => {
    const b = extractBalance(
      [
        { token_symbol: "USDC", value_usd: 300 },
        { token_symbol: "PEPE", value_usd: 600 },
        { token_symbol: "dust", value_usd: 100 },
      ],
      false,
    );
    expect(b).toEqual({ ok: true, tokens: 3, tokensCapped: true, totalUsd: 1000, topShare: 0.6, topSymbol: "PEPE", stableShare: 0.3 });
  });
  it("empty balance → zeros with null shares; negative/null values are treated as 0", () => {
    expect(extractBalance([], true)).toMatchObject({ tokens: 0, totalUsd: 0, topShare: null, topSymbol: null, stableShare: null });
    expect(
      extractBalance(
        [
          { token_symbol: "X", value_usd: -5 },
          { token_symbol: "Y", value_usd: null },
        ],
        true,
      ),
    ).toMatchObject({ tokens: 2, totalUsd: 0, topShare: null });
  });
});

describe("extractCounterparties", () => {
  it("volume-weighted class mix, counts, top-outflow share, interactions, cap flag", () => {
    const k = extractCounterparties(
      [
        { counterparty_address_label: ["Liquidity Pool"], interaction_count: 25, total_volume_usd: 700, volume_out_usd: 300 },
        { counterparty_address_label: ["High Balance"], interaction_count: 12, total_volume_usd: 200, volume_out_usd: 100 },
        { counterparty_address_label: null, interaction_count: 4, total_volume_usd: 100, volume_out_usd: 100 },
      ],
      false,
    );
    expect(k.count).toBe(3);
    expect(k.countCapped).toBe(true);
    expect(k.interactions).toBe(41);
    expect(k.topOutShare).toBe(0.6);
    expect(k.mix.pool).toBe(0.7);
    expect(k.mix.wealth).toBe(0.2);
    expect(k.mix.unlabelled).toBe(0.1);
    expect(k.counts.pool).toBe(1);
    expect(MIX_KEYS.reduce((a, key) => a + k.mix[key], 0)).toBeCloseTo(1, 5);
  });
  it("falls back to count shares when every volume is null", () => {
    const k = extractCounterparties(
      [
        { counterparty_address_label: ["Proxy"], interaction_count: 1 },
        { counterparty_address_label: null, interaction_count: 1 },
      ],
      true,
    );
    expect(k.mix.contract).toBe(0.5);
    expect(k.mix.unlabelled).toBe(0.5);
    expect(k.topOutShare).toBeNull();
  });
  it("empty / failed", () => {
    expect(extractCounterparties([], true)).toMatchObject({ ok: true, count: 0, topOutShare: null });
    expect(extractCounterparties(undefined, undefined, false).ok).toBe(false);
  });
});

describe("fetchClues — four calls in parallel, sections degrade independently", () => {
  it("a trader personality produces trader-shaped clues from live-shaped responses", async () => {
    const c = fakeClient(clueRoutes("trader"));
    const { clues, failures } = await fetchClues(c, ADDR(1), Date.parse("2026-09-18T10:00:00Z"));
    expect(failures).toEqual([]);
    expect(clues.pnl).toMatchObject({ trades: 472, winRate: 0.667, realizedUsd: 11892, tokensTraded: 6 });
    expect(clues.trades.rows[0]).toEqual({ symbol: "GIVE", pnlUsd: 9101, buys: 120, sells: 118 });
    expect(clues.balance).toMatchObject({ tokens: 3, totalUsd: 4901, topSymbol: "WPRL" });
    expect(clues.counterparties.count).toBe(3);
    expect(clues.counterparties.mix.activity).toBeGreaterThan(0.9);
    expect(clues.empty).toBe(false);
    expect(c.calls.map((x) => x.endpoint).sort()).toEqual([
      "profiler/address/counterparties",
      "profiler/address/current-balance",
      "profiler/address/pnl",
      "profiler/address/pnl-summary",
    ]);
    expect(c.creditsSpent).toBe(8);
  });
  it("the 30-day window and the pnl date are sent (HTTP 400 without it — spike finding)", async () => {
    const c = fakeClient(clueRoutes("regular"));
    await fetchClues(c, ADDR(2), Date.parse("2026-09-18T10:00:00Z"));
    const pnl = c.calls.find((x) => x.endpoint === "profiler/address/pnl")!;
    expect(pnl.body.date).toEqual({ from: "2026-08-19", to: "2026-09-18" });
    const cps = c.calls.find((x) => x.endpoint === "profiler/address/counterparties")!;
    expect(cps.body).toMatchObject({ group_by: "wallet", source_input: "Combined", date: { from: "2026-08-19", to: "2026-09-18" } });
  });
  it("one failing section does not sink the card; it is named in failures and provenance", async () => {
    const routes = clueRoutes("regular");
    const c = fakeClient((e) => (e === "profiler/address/counterparties" ? new Response("timeout", { status: 504 }) : routes(e)));
    const { clues, failures } = await fetchClues(c, ADDR(3), Date.now());
    expect(failures).toEqual([{ section: "counterparties", error: expect.stringMatching(/504/) }]);
    expect(clues.counterparties.ok).toBe(false);
    expect(clues.pnl.ok).toBe(true);
    expect(clues.empty).toBe(false);
    expect(c.calls.find((x) => x.endpoint === "profiler/address/counterparties")!.ok).toBe(false);
  });
  it("an address with nothing anywhere is an empty card (still a card)", async () => {
    const c = fakeClient(clueRoutes("empty"));
    const { clues } = await fetchClues(c, ADDR(4), Date.now());
    expect(clues.empty).toBe(true);
  });
});
