import type { NansenClient, Call } from "./client.js";
import { nansen, type HolderLabelType } from "./nansen.js";
import { classFromTag, tagIsNeutral, POOL_TAG, type LabelClass } from "./classes.js";
import { buildCard, type Card } from "./card.js";
import { TOKENS } from "./sources.js";
import { rng, shuffle } from "./round.js";
import type { ClueFailure } from "./clues.js";

export type DrawEvent = { type: "call"; call: Call } | { type: "picked"; class: LabelClass; token: string; page: number; candidates: number } | { type: "card"; card: Card } | { type: "error"; message: string };

export type DrawOptions = { class?: LabelClass; seed?: string; exclude?: Set<string>; now?: number; onProgress?: (e: DrawEvent) => void; tokens?: Record<string, string> };

export const DRAW_CLASSES: LabelClass[] = ["smart-money", "exchange", "whale", "contract", "regular"];

/** the sourcing call for a class: holders with the class filter; whale/contract read tags off a plain page; regular = who-bought-sold(excluded) */
async function candidatesFor(c: NansenClient, cls: LabelClass, token: string, page: number, now: number): Promise<{ address: string; tag: string; labelType: string | null; endpoint: string }[]> {
  if (cls === "smart-money") {
    // the live Smart Money feed: traders who traded in the last hours — active by construction, never a dormant holder
    const r = await nansen.smartMoneyTrades(c);
    return [...new Map(r.data.map((t) => [t.trader_address.toLowerCase(), t])).values()]
      .filter((t) => classFromTag(t.trader_address_label) !== "contract")
      .map((t) => ({ address: t.trader_address.toLowerCase(), tag: t.trader_address_label ?? "", labelType: null, endpoint: "smart-money/dex-trades" }));
  }
  if (cls === "regular") {
    const r = await nansen.whoBought(c, token, now);
    return r.data.filter((x) => tagIsNeutral(x.address_label)).map((x) => ({ address: x.address, tag: x.address_label ?? "", labelType: "exclude all 17 label groups", endpoint: "tgm/who-bought-sold" }));
  }
  // whale: the page with every label group excluded server-side, so a Token Billionaire that is really an exchange never deals as a whale;
  // contract: the plain page (pools sit inside Nansen's Exchange group and would be excluded)
  const lt: HolderLabelType = cls === "exchange" ? "exchange" : cls === "whale" ? "all_holders" : "all_holders_plain";
  const r = await nansen.holders(c, token, lt, page, 100);
  return r.data
    .filter((x) => x.address)
    .filter((x) => (cls === "whale" ? classFromTag(x.address_label) === "whale" : cls === "contract" ? POOL_TAG.test(x.address_label ?? "") : classFromTag(x.address_label) !== "contract"))
    .map((x) => ({ address: x.address!, tag: x.address_label ?? "", labelType: lt === "all_holders_plain" ? "all_holders" : lt, endpoint: "tgm/holders" }));
}

/**
 * Draw one fresh card live: pick a class (random unless given), one sourcing page, one address not in `exclude`
 * (the committed deck), then the four clue calls. 13 credits. Every Nansen call is emitted as a `call` event as it
 * lands, so the UI can stream provenance rows. Throws on a failed sourcing call; a failed clue call degrades a section.
 */
export async function drawCard(c: NansenClient, opts: DrawOptions = {}): Promise<{ card: Card; failures: ClueFailure[] }> {
  const now = opts.now ?? Date.now();
  const next = rng(opts.seed ?? `${now}:${Math.random()}`);
  const cls = opts.class ?? DRAW_CLASSES[Math.floor(next() * DRAW_CLASSES.length)];
  // class lists (smart_money / exchange / who-bought-sold) are short — page 1 only; plain holder pages run deep — pages 1–3
  const tokens = shuffle(Object.entries(opts.tokens ?? TOKENS), next);
  const deepPage = cls === "whale" || cls === "contract";
  let fresh: Awaited<ReturnType<typeof candidatesFor>> = [];
  let sym = "",
    page = 1;
  // up to three sourcing pages (5 credits each) before giving up — a page whose rows are all in the deck is not a failure of Nansen
  for (const [trySym, token] of tokens.slice(0, cls === "smart-money" ? 1 : 3)) {
    sym = trySym;
    page = deepPage ? 1 + Math.floor(next() * 3) : 1;
    const seenBefore = c.calls.length;
    let rows: Awaited<ReturnType<typeof candidatesFor>>;
    try {
      rows = await candidatesFor(c, cls, token, page, now);
    } finally {
      for (const call of c.calls.slice(seenBefore)) opts.onProgress?.({ type: "call", call });
    }
    fresh = rows.filter((r) => !opts.exclude?.has(r.address.toLowerCase()));
    opts.onProgress?.({ type: "picked", class: cls, token: sym, page, candidates: fresh.length });
    if (fresh.length) break;
  }
  if (fresh.length === 0) throw new Error(`no unseen ${cls} wallet on the sourcing pages tried — try again`);
  // smart-money: prefer a row that will have trades; we cannot know before the clues, so pick at random and accept the card as dealt
  const pick = fresh[Math.floor(next() * fresh.length)];
  const before = c.calls.length;
  const result = await buildCard(c, { address: pick.address, class: cls, nansenLabel: pick.tag, source: { endpoint: pick.endpoint, labelType: pick.labelType, token: sym, tag: pick.tag } }, now);
  for (const call of c.calls.slice(before)) opts.onProgress?.({ type: "call", call });
  opts.onProgress?.({ type: "card", card: result.card });
  return result;
}
