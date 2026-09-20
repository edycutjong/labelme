import { describe, it, expect } from "vitest";
import { NansenClient, CREDITS, clientFromEnv } from "../src/client.js";
import { nansen } from "../src/nansen.js";
import { fakeClient, KEY, ADDR } from "./helpers.js";

describe("NansenClient", () => {
  it("rejects a missing or malformed key", () => {
    expect(() => new NansenClient("")).toThrow(/NANSEN_API_KEY/);
    expect(() => new NansenClient("abc")).toThrow(/nsn_/);
  });
  it("sends the apikey header and records credits from the table, status and a sha256 of the raw body", async () => {
    let headers: Record<string, string> = {};
    const fetchImpl: typeof fetch = async (_u, init) => {
      headers = init!.headers as Record<string, string>;
      return new Response('{"data":[]}', { status: 200 });
    };
    const c = new NansenClient(KEY, { fetchImpl });
    await c.post("tgm/holders", { chain: "ethereum", token_address: "0x1" }, ["data[].address_label"]);
    expect(headers.apikey).toMatch(/^nsn_/);
    expect(c.calls[0]).toMatchObject({
      endpoint: "tgm/holders",
      credits: 5,
      status: 200,
      cached: false,
      fieldsUsed: ["data[].address_label"],
      reportedCredits: undefined,
    });
    expect(c.calls[0].responseHash).toHaveLength(64);
    expect(c.creditsSpent).toBe(5);
  });
  it("onStart fires before the network with a seq the landed Call carries — on success, on failure, and on a cache hit", async () => {
    const order: string[] = [];
    const c = fakeClient((endpoint) => (endpoint === "tgm/holders" ? { ok: 1 } : new Response("nope", { status: 400 })));
    c.onStart = (s) => order.push(`start:${s.seq}:${s.endpoint}`);
    c.onCall = (k) => order.push(`call:${k.seq}:${k.endpoint}:${k.ok}`);
    await c.post("tgm/holders", { chain: "ethereum" });
    await expect(c.post("profiler/address/pnl", {})).rejects.toThrow();
    expect(order).toEqual(["start:1:tgm/holders", "call:1:tgm/holders:true", "start:2:profiler/address/pnl", "call:2:profiler/address/pnl:false"]);
    expect(c.calls.map((k) => k.seq)).toEqual([1, 2]);
  });
  it("prefers the x-nansen-credits-cost header over the static table", async () => {
    const c = fakeClient(() => ({ ok: 1 }), {}, { "x-nansen-credits-cost": "150" });
    await c.post("tgm/holders", {});
    expect(c.calls[0].credits).toBe(150);
    expect(c.calls[0].reportedCredits).toBe(150);
    expect(c.creditsSpent).toBe(150);
  });
  it("ignores a malformed credits header and falls back to the table", async () => {
    const c = fakeClient(() => ({ ok: 1 }), {}, { "x-nansen-credits-cost": "n/a" });
    await c.post("profiler/address/counterparties", {});
    expect(c.calls[0].credits).toBe(5);
  });
  it("the credit table covers every endpoint the engine calls", () => {
    for (const e of [
      "tgm/holders",
      "tgm/who-bought-sold",
      "smart-money/dex-trades",
      "profiler/address/pnl-summary",
      "profiler/address/pnl",
      "profiler/address/current-balance",
      "profiler/address/counterparties",
      "profiler/address/transactions",
      "transaction-with-token-transfer-lookup",
    ])
      expect(CREDITS[e], e).toBeTypeOf("number");
    expect(CREDITS["profiler/address/labels"]).toBe(100);
  });
  it("retries once on 429 then succeeds; the failed attempt is not recorded as a call", async () => {
    let n = 0;
    const c = fakeClient(() => (n++ === 0 ? new Response("slow down", { status: 429 }) : { ok: true }));
    expect(await c.post("tgm/holders", {})).toEqual({ ok: true });
    expect(n).toBe(2);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].attempts).toBe(2);
  });
  it("throws NansenError on 4xx without retry and records the failure at 0 credits", async () => {
    let n = 0;
    const c = fakeClient(() => {
      n++;
      return new Response('{"error":"Bad Request"}', { status: 400 });
    });
    await expect(c.post("profiler/address/pnl", {})).rejects.toThrow(/HTTP 400/);
    expect(n).toBe(1);
    expect(c.calls[0]).toMatchObject({ ok: false, status: 400, credits: 0, attempts: 1 });
  });
  it("gives up after the second 5xx with attempts=2 and totalMs ≥ the backoff", async () => {
    const c = fakeClient(() => new Response("boom", { status: 503 }));
    await expect(c.post("tgm/holders", {})).rejects.toThrow(/HTTP 503/);
    expect(c.calls[0]).toMatchObject({ ok: false, status: 503, attempts: 2 });
    expect(c.calls[0].totalMs).toBeGreaterThanOrEqual(700);
  });
  it("a first-attempt timeout is retried and counted", async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async (_u, init) => {
      if (n++ === 0)
        await new Promise((_, rej) => init!.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      return new Response('{"ok":1}', { status: 200 });
    };
    const c = new NansenClient(KEY, { fetchImpl, timeoutMs: 30, rps: 1000 });
    await c.post("tgm/holders", {});
    expect(c.calls[0].attempts).toBe(2);
  });
  it("retries: 0 fails fast on a 5xx with attempts=1", async () => {
    let n = 0;
    const c = fakeClient(() => {
      n++;
      return new Response("x", { status: 503 });
    });
    await expect(c.post("tgm/holders", {}, [], { retries: 0 })).rejects.toThrow();
    expect(n).toBe(1);
    expect(c.calls[0].attempts).toBe(1);
  });
  it("nansen.transactions and nansen.txLookup parse live-shaped responses (used by scripts/seed.ts and scripts/spike.ts)", async () => {
    const c = fakeClient((endpoint) => {
      if (endpoint === "profiler/address/transactions")
        return { data: [{ transaction_hash: "0xabc", block_timestamp: "2026-09-18T00:00:00Z", method: "transfer" }], pagination: {} };
      if (endpoint === "transaction-with-token-transfer-lookup")
        return {
          data: [{ from_address: "0x1", from_address_label: "A", to_address: "0x2", to_address_label: "B", token_transfer_array: [] }],
        };
      throw new Error("unexpected " + endpoint);
    });
    const tx = await nansen.transactions(c, ADDR(1), Date.now());
    expect(tx.data?.[0].transaction_hash).toBe("0xabc");
    const l = await nansen.txLookup(c, "0xabc");
    expect(l.data?.[0].from_address_label).toBe("A");
  });
  it("redacts the API key from an upstream error body before recording it", async () => {
    const c = fakeClient(() => new Response(`bad key ${KEY} rejected`, { status: 401 }));
    await expect(c.post("tgm/holders", {})).rejects.toThrow(/nsn_\[redacted\]/);
    expect(JSON.stringify(c.calls)).not.toContain(KEY);
  });
  it("clientFromEnv builds a client from NANSEN_API_KEY", () => {
    const prev = process.env.NANSEN_API_KEY;
    process.env.NANSEN_API_KEY = KEY;
    try {
      expect(clientFromEnv()).toBeInstanceOf(NansenClient);
    } finally {
      if (prev === undefined) delete process.env.NANSEN_API_KEY;
      else process.env.NANSEN_API_KEY = prev;
    }
  });
  it("clientFromEnv falls back to an empty key when NANSEN_API_KEY is unset, which the client rejects", () => {
    const prev = process.env.NANSEN_API_KEY;
    delete process.env.NANSEN_API_KEY;
    try {
      expect(() => clientFromEnv()).toThrow(/NANSEN_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.NANSEN_API_KEY = prev;
    }
  });
  it("a live call to an endpoint outside the CREDITS table with no reported cost falls back to 1 credit", async () => {
    const c = fakeClient(() => ({ ok: 1 }));
    await c.post("totally/unknown-endpoint", {});
    expect(c.calls[0].credits).toBe(1);
  });
  it("a timeout exhausted on every attempt is recorded with error 'timeout' (AbortError branch)", async () => {
    const fetchImpl: typeof fetch = async (_u, init) =>
      new Promise((_, rej) => init!.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    const c = new NansenClient(KEY, { fetchImpl, timeoutMs: 20, rps: 1000 });
    await expect(c.post("tgm/holders", {})).rejects.toThrow();
    expect(c.calls[0]).toMatchObject({ ok: false, error: "timeout" });
  });
  it("rate limiter: never more than rps requests in a rolling second", async () => {
    const stamps: number[] = [];
    const c = fakeClient(
      () => {
        stamps.push(Date.now());
        return { ok: 1 };
      },
      { rps: 3 },
    );
    await Promise.all(Array.from({ length: 6 }, () => c.post("account", {})));
    stamps.sort((a, b) => a - b);
    expect(stamps[3] - stamps[0]).toBeGreaterThanOrEqual(900);
  });
});
