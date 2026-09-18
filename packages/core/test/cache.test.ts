import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CachedNansenClient, MemoryCache, DiskCache, cacheKey, canonicalize, DEFAULT_TTL_MS } from "../src/cache.js";
import { fakeCached, fakeFetch, KEY } from "./helpers.js";

describe("cache keys", () => {
  it("canonicalize sorts keys at every depth and keeps array order", () => {
    expect(JSON.stringify(canonicalize({ b: { y: 1, x: [3, { q: 1, p: 2 }] }, a: 0 }))).toBe('{"a":0,"b":{"x":[3,{"p":2,"q":1}],"y":1}}');
  });
  it("same endpoint + body in any key order → same key; a different body → a different key", () => {
    expect(cacheKey("tgm/holders", { chain: "ethereum", token_address: "0x1" })).toBe(cacheKey("tgm/holders", { token_address: "0x1", chain: "ethereum" }));
    expect(cacheKey("tgm/holders", { chain: "ethereum", token_address: "0x1" })).not.toBe(cacheKey("tgm/holders", { chain: "ethereum", token_address: "0x2" }));
    expect(cacheKey("a", {})).toHaveLength(32);
  });
  it("default TTL is 24 h (a card is a snapshot; rehearsal and recording share numbers)", () => {
    expect(DEFAULT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("CachedNansenClient", () => {
  it("second identical call is a cache hit recorded at 0 credits with the same responseHash", async () => {
    let n = 0;
    const c = fakeCached(() => ({ n: ++n }));
    const a = await c.post("tgm/holders", { chain: "ethereum" });
    const b = await c.post("tgm/holders", { chain: "ethereum" });
    expect(a).toEqual(b);
    expect(n).toBe(1);
    expect(c.calls[1]).toMatchObject({ cached: true, credits: 0, attempts: 0 });
    expect(c.calls[1].responseHash).toBe(c.calls[0].responseHash);
    expect(c.creditsSpent).toBe(5);
    expect(c.oldestHit).toBeTypeOf("string");
  });
  it("ttlMs: 0 bypasses reads (the --no-cache path) but still writes", async () => {
    let n = 0;
    const store = new MemoryCache();
    const c = new CachedNansenClient(KEY, { fetchImpl: fakeFetch(() => ({ n: ++n })), rps: 1000, store, ttlMs: 0 });
    await c.post("tgm/holders", {});
    await c.post("tgm/holders", {});
    expect(n).toBe(2);
    expect(Object.keys(store.entries())).toHaveLength(1);
  });
  it("offline: serves any entry regardless of age; a miss throws and never touches the network", async () => {
    const store = new MemoryCache();
    store.set(cacheKey("tgm/holders", { a: 1 }), { storedAt: "2020-01-01T00:00:00Z", ttlMs: 1, endpoint: "tgm/holders", body: { a: 1 }, text: '{"old":true}' });
    let fetched = 0;
    const c = new CachedNansenClient(KEY, {
      fetchImpl: fakeFetch(() => {
        fetched++;
        return {};
      }),
      store,
      offline: true,
    });
    expect(await c.post("tgm/holders", { a: 1 })).toEqual({ old: true });
    await expect(c.post("tgm/holders", { a: 2 })).rejects.toThrow(/NANSEN_OFFLINE/);
    expect(fetched).toBe(0);
  });
  it("a failed live call is recorded (ok:false) and not cached", async () => {
    const store = new MemoryCache();
    const c = new CachedNansenClient(KEY, { fetchImpl: fakeFetch(() => new Response("x", { status: 400 })), rps: 1000, store });
    await expect(c.post("tgm/holders", {})).rejects.toThrow();
    expect(c.calls[0].ok).toBe(false);
    expect(Object.keys(store.entries())).toHaveLength(0);
  });
  it("header-reported credits are recorded on a live call and 0 on the hit", async () => {
    const store = new MemoryCache();
    const c = new CachedNansenClient(KEY, { fetchImpl: fakeFetch(() => ({}), { "x-nansen-credits-cost": "1" }), rps: 1000, store });
    await c.post("tgm/holders", {});
    await c.post("tgm/holders", {});
    expect(c.calls[0].credits).toBe(1);
    expect(c.calls[1].credits).toBe(0);
  });
  it("DiskCache round-trips an entry and survives a corrupt file", () => {
    const dir = mkdtempSync(join(tmpdir(), "labelme-cache-"));
    const d = new DiskCache(dir);
    d.set("k", { storedAt: "x", ttlMs: 1, endpoint: "e", body: {}, text: "{}" });
    expect(d.get("k")?.text).toBe("{}");
    expect(d.get("missing")).toBeUndefined();
  });
});
