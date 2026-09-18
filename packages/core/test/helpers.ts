import { NansenClient, type ClientOptions } from "../src/client.js";
import { CachedNansenClient, MemoryCache, type CachedClientOptions } from "../src/cache.js";
import type { Clues } from "../src/clues.js";

export const KEY = "nsn_test_key_0000000000000000000000";
export const ADDR = (i: number | string) => `0x${String(i).padStart(40, "0")}`.slice(0, 42);

/** A NansenClient whose network is a lookup table: (endpoint, body) → JSON | Response. Records calls like the real one. */
export function fakeFetch(routes: (endpoint: string, body: Record<string, unknown>) => unknown, headers: Record<string, string> = {}): typeof fetch {
  return async (url, init) => {
    const endpoint = String(url).replace("https://api.nansen.ai/api/v1/", "");
    const body = JSON.parse(String(init?.body ?? "{}"));
    const out = routes(endpoint, body);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json", ...headers } });
  };
}
export function fakeClient(routes: (endpoint: string, body: Record<string, unknown>) => unknown, opts: ClientOptions = {}, headers?: Record<string, string>) {
  return new NansenClient(KEY, { fetchImpl: fakeFetch(routes, headers), rps: 1000, ...opts });
}
export function fakeCached(routes: (endpoint: string, body: Record<string, unknown>) => unknown, opts: CachedClientOptions = {}) {
  return new CachedNansenClient(KEY, { fetchImpl: fakeFetch(routes), rps: 1000, store: new MemoryCache(), ...opts });
}

/** Live-shaped responses for the four clue calls, parameterised by wallet "personality". */
export type Personality = "trader" | "exchange" | "whale" | "pool" | "regular" | "empty" | "proxy";
export function clueRoutes(p: Personality, over: Partial<Record<string, unknown>> = {}) {
  return (endpoint: string): unknown => {
    if (endpoint === "profiler/address/pnl-summary") {
      const base = {
        pagination: { page: 1, per_page: 1, is_last_page: true },
        top5_tokens: [] as unknown[],
        traded_token_count: 0,
        traded_times: 0,
        realized_pnl_usd: 0,
        realized_pnl_percent: 0,
        win_rate: 0,
      };
      if (p === "trader")
        return {
          ...base,
          top5_tokens: [{ token_symbol: "GIVE", realized_pnl: 9101.4, realized_roi: 0.12, token_address: "0x1", chain: "ethereum" }],
          traded_token_count: 6,
          traded_times: 472,
          realized_pnl_usd: 11892.3,
          realized_pnl_percent: 0.0412,
          win_rate: 0.6667,
        };
      if (p === "regular")
        return {
          ...base,
          top5_tokens: [{ token_symbol: "ETH", realized_pnl: 9, realized_roi: 0.001, token_address: "0xe", chain: "ethereum" }],
          traded_token_count: 2,
          traded_times: 13,
          realized_pnl_usd: 9.2,
          realized_pnl_percent: 0.001,
          win_rate: 1,
        };
      if (p === "whale") return { ...base, traded_times: 3, traded_token_count: 1, win_rate: 0 };
      return { ...base, ...(over.pnlSummary as object) };
    }
    if (endpoint === "profiler/address/pnl") {
      if (p === "trader")
        return {
          pagination: {},
          data: [
            { token_symbol: "GIVE", pnl_usd_realised: 9101.4, nof_buys: "120", nof_sells: "118" },
            { token_symbol: "GULD", pnl_usd_realised: -300.2, nof_buys: "5", nof_sells: 4 },
          ],
        };
      if (p === "regular") return { pagination: {}, data: [{ token_symbol: "ETH", pnl_usd_realised: 9, nof_buys: "3", nof_sells: "5" }] };
      return { pagination: {}, data: [] };
    }
    if (endpoint === "profiler/address/current-balance") {
      const row = (s: string, usd: number) => ({
        chain: "ethereum",
        address: "0x",
        token_address: "0x",
        token_symbol: s,
        token_name: s,
        token_amount: 1,
        price_usd: 1,
        value_usd: usd,
      });
      if (p === "exchange")
        return { pagination: { is_last_page: false }, data: Array.from({ length: 100 }, (_, i) => row(i === 0 ? "USDT" : `T${i}`, i === 0 ? 3e9 : 6e7)) };
      if (p === "whale") return { pagination: { is_last_page: true }, data: [row("PEPE", 29_952_734)] };
      if (p === "pool") return { pagination: { is_last_page: true }, data: [row("PEPE", 14_100_000), row("WETH", 14_071_038)] };
      if (p === "trader") return { pagination: { is_last_page: true }, data: [row("WPRL", 3832), row("USDC", 500), row("ETH", 569)] };
      if (p === "regular") return { pagination: { is_last_page: true }, data: [row("PEPE", 35_000), row("ETH", 191)] };
      if (p === "proxy") return { pagination: { is_last_page: true }, data: Array.from({ length: 10 }, (_, i) => row(`T${i}`, 16_000)) };
      return { pagination: { is_last_page: true }, data: [] };
    }
    if (endpoint === "profiler/address/counterparties") {
      const cp = (labels: string[] | null, n: number, vol: number, out: number) => ({
        counterparty_address: "0xc",
        counterparty_address_label: labels,
        interaction_count: n,
        total_volume_usd: vol,
        volume_in_usd: vol - out,
        volume_out_usd: out,
      });
      if (p === "exchange")
        return {
          pagination: { is_last_page: true },
          data: [cp(["Token Billionaire"], 200, 8e8, 4e8), cp(["High Balance"], 40, 1e8, 2e7), cp(null, 5, 1e6, 1e6)],
        };
      if (p === "whale") return { pagination: { is_last_page: true }, data: [cp(null, 1, 1000, 0)] };
      if (p === "pool")
        return {
          pagination: { is_last_page: false },
          data: Array.from({ length: 50 }, (_, i) => cp(i % 3 ? ["Token Millionaire"] : ["High Activity"], 750, 1e6, 5e5)),
        };
      if (p === "trader")
        return {
          pagination: { is_last_page: true },
          data: [cp(["High Activity"], 300, 342_045, 170_000), cp(["Liquidity Pool"], 100, 83, 40), cp(null, 72, 21_113, 21_113)],
        };
      if (p === "regular") return { pagination: { is_last_page: true }, data: [cp(["Uniswap V2"], 8, 30_000, 15_000), cp(null, 6, 12_000, 12_000)] };
      return { pagination: { is_last_page: true }, data: [] };
    }
    throw new Error("unexpected endpoint " + endpoint);
  };
}

export function clues(over: Partial<Clues> = {}): Clues {
  const mix = { pool: 0, entity: 0, contract: 0, wealth: 0, activity: 0, ens: 0, other: 0, unlabelled: 1 };
  return {
    pnl: { ok: true, realizedUsd: 0, realizedPct: null, winRate: null, trades: 0, tokensTraded: 0, top: [] },
    trades: { ok: true, rows: [] },
    balance: { ok: true, tokens: 1, tokensCapped: false, totalUsd: 100, topShare: 1, topSymbol: "ETH", stableShare: 0 },
    counterparties: { ok: true, count: 1, countCapped: false, interactions: 1, topOutShare: null, mix, counts: { ...mix } },
    empty: false,
    ...over,
  };
}
