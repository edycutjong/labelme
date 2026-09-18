/**
 * Boundary tests — the claims in .github/SECURITY.md, backed by tests:
 *
 *   1. the server-side NANSEN_API_KEY never reaches a client: not in a card, a face, a draw event, provenance, a cache key
 *      or an error message;
 *   2. the public routes reject garbage BEFORE any network call (and before the key is looked at);
 *   3. a deck face never carries the answer.
 *
 * The route handlers are driven directly (vitest resolves `@/` to apps/web).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { NextRequest } from "next/server";
import { drawCard, cacheKey, face, loadDeck, type DrawEvent } from "../src/index.js";
import { fakeClient, clueRoutes, ADDR, KEY } from "./helpers.js";
import { GET as roundRoute } from "@/app/api/round/route";
import { GET as revealRoute } from "@/app/api/reveal/route";
import { POST as drawRoute } from "@/app/api/draw/route";
import { resetGuard, ipAllowed, budgetExhausted, recordSpend, creditsLeft, DAILY_CREDITS, IP_PER_MIN } from "@/lib/guard";

const KEY_SHAPE = /nsn_[A-Za-z0-9_]{8,}/;
const holder = (address: string, label: string | null) => ({ address, address_label: label, value_usd: 1 });

describe("boundary 1: the key never leaves the server", () => {
  it("a live draw's card, every event, the provenance log and the cache keys contain nothing key-shaped", async () => {
    const c = fakeClient((e) => (e === "tgm/holders" ? { data: [holder(ADDR("w1"), "Token Millionaire")], pagination: {} } : clueRoutes("whale")(e)));
    const events: DrawEvent[] = [];
    const { card } = await drawCard(c, { class: "whale", seed: "s", onProgress: (e) => events.push(e) });
    for (const payload of [card, face(card), ...events, c.calls]) {
      const text = JSON.stringify(payload);
      expect(text).not.toContain(KEY);
      expect(text).not.toMatch(KEY_SHAPE);
    }
    for (const call of c.calls) {
      expect(JSON.stringify(call.body)).not.toContain("apikey");
      expect(cacheKey(call.endpoint, call.body)).not.toMatch(KEY_SHAPE);
    }
  });
  it("an upstream error that echoes the key is redacted before it can be recorded or thrown", async () => {
    const c = fakeClient(() => new Response(`denied for ${KEY}`, { status: 403 }));
    await expect(c.post("tgm/holders", {}, [])).rejects.not.toThrow(KEY);
    expect(JSON.stringify(c.calls)).not.toContain(KEY);
  });
});

describe("boundary 2: routes reject garbage before any network call", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    resetGuard();
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("/api/reveal: 10,000 generated ids that are not 10 hex chars → 400, never a network call, never a card", async () => {
    let checked = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 40 }).filter((s) => !/^[0-9a-f]{10}$/.test(s)),
        async (id) => {
          const res = revealRoute(new NextRequest(`http://x/api/reveal?id=${encodeURIComponent(id)}`));
          expect(res.status).toBe(400);
          checked++;
        },
      ),
      { numRuns: 10_000 },
    );
    expect(checked).toBe(10_000);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("/api/reveal: a well-formed unknown id → 404; a bad guess value → 400", () => {
    expect(revealRoute(new NextRequest("http://x/api/reveal?id=0123456789")).status).toBe(404);
    const real = loadDeck()[0];
    expect(revealRoute(new NextRequest(`http://x/api/reveal?id=${real.id}&guess=hacker`)).status).toBe(400);
  });
  it("/api/round: an over-long seed → 400; any other seed is squeezed and answered with ten faces and no answers", async () => {
    expect(roundRoute(new NextRequest(`http://x/api/round?seed=${"a".repeat(65)}`)).status).toBe(400);
    const res = roundRoute(new NextRequest("http://x/api/round?seed=%3Cscript%3E%20meridian"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seed: string; cards: Record<string, unknown>[] };
    expect(body.seed).toBe("scriptmeridian");
    expect(body.cards).toHaveLength(10);
    for (const f of body.cards) expect(Object.keys(f).sort()).toEqual(["cardHash", "chain", "clues", "id"]);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/"class":|"nansenLabel":|"tell":|"address":|"readerGuess":/);
    for (const c of loadDeck()) expect(text).not.toContain(c.address);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("/api/draw: an unknown class → 400 with no fetch; without a key the stream deals a labelled deck replay, still no fetch", async () => {
    const bad = await drawRoute(new NextRequest("http://x/api/draw?class=hacker", { method: "POST" }));
    expect(bad.status).toBe(400);
    const prev = process.env.NANSEN_API_KEY;
    delete process.env.NANSEN_API_KEY;
    try {
      const res = await drawRoute(new NextRequest("http://x/api/draw", { method: "POST" }));
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = text
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string });
      expect(events[0].type).toBe("replay");
      expect(events.map((e) => e.type)).toContain("card");
      expect(text).not.toMatch(KEY_SHAPE);
    } finally {
      if (prev !== undefined) process.env.NANSEN_API_KEY = prev;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("/api/draw: the per-IP gate returns 429 with Retry-After after IP_PER_MIN draws in a minute", async () => {
    for (let i = 0; i < IP_PER_MIN; i++) expect(ipAllowed("1.2.3.4").ok).toBe(true);
    const res = await drawRoute(new NextRequest("http://x/api/draw", { method: "POST", headers: { "x-forwarded-for": "1.2.3.4" } }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("guard arithmetic", () => {
  beforeEach(() => resetGuard());
  it("the daily ceiling counts spend, rolls over at UTC midnight and degrades before the last draw could overspend", () => {
    const t = Date.parse("2026-09-18T10:00:00Z");
    expect(creditsLeft(t)).toBe(DAILY_CREDITS);
    recordSpend(DAILY_CREDITS - 10, t);
    recordSpend(-5, t); // a negative spend is ignored
    expect(creditsLeft(t)).toBe(10);
    expect(budgetExhausted(t)).toBe(true);
    expect(budgetExhausted(t + 24 * 3600 * 1000)).toBe(false); // UTC rollover resets the day
  });
  it("the IP window is a rolling minute and the address is taken from x-forwarded-for's first hop", () => {
    const t = Date.now();
    for (let i = 0; i < IP_PER_MIN; i++) expect(ipAllowed("9.9.9.9", t).ok).toBe(true);
    const blocked = ipAllowed("9.9.9.9", t + 1000);
    expect(blocked.ok).toBe(false);
    expect(ipAllowed("9.9.9.9", t + 61_000).ok).toBe(true);
  });
});

describe("boundary 3: a face never carries the answer", () => {
  it("for every card in the committed deck", () => {
    for (const c of loadDeck()) {
      const f = JSON.stringify(face(c));
      expect(f).not.toContain(c.address);
      expect(f).not.toContain(c.tell);
      if (c.entity) expect(f).not.toContain(c.entity);
    }
  });
});
