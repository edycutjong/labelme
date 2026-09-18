import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MemoryCache, type CacheEntry } from "./cache.js";
import type { Card } from "./card.js";
import type { Dropped } from "./sources.js";

/**
 * A recorded card: every raw Nansen response its clues touched (keyed by cache key, byte-for-byte as sent), the card
 * it produced, and the clock it ran under. `scripts/seed.ts` writes these; `scripts/verify.ts` replays them with
 * NANSEN_OFFLINE=1 — same responses, same clock, same cardHash. Responses are never edited. The key is never here.
 */
export type CardFixture = {
  edge: string;
  recordedAt: string;
  now: number;
  live: { calls: number; credits: number; ms: number; failed: string[] };
  responses: Record<string, CacheEntry>;
  card: Card;
};
export type DeckFile = {
  version: number;
  recordedAt: string;
  chain: "ethereum";
  cards: number;
  byClass: Record<string, number>;
  deckHash: string;
  ids: string[];
};

export const FIXTURES_DIR = "fixtures";
export const CARDS_DIR = join(FIXTURES_DIR, "cards");

export function writeCardFixture(f: CardFixture, dir = CARDS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${f.card.address}.json`);
  writeFileSync(path, JSON.stringify(f, null, 2) + "\n");
  return path;
}
export function readCardFixture(path: string): CardFixture {
  return JSON.parse(readFileSync(path, "utf8")) as CardFixture;
}
export function listCardFixtures(dir = CARDS_DIR): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .sort()
      .map((n) => join(dir, n));
  } catch {
    return [];
  }
}
export function fixtureStore(f: CardFixture): MemoryCache {
  const store = new MemoryCache();
  for (const [key, entry] of Object.entries(f.responses)) store.set(key, entry);
  return store;
}
export function writeDeckFile(d: DeckFile, dir = FIXTURES_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "deck.json");
  writeFileSync(path, JSON.stringify(d, null, 2) + "\n");
  return path;
}
export function writeDropped(rows: Dropped[], dir = FIXTURES_DIR): string {
  const path = join(dir, "dropped.json");
  writeFileSync(path, JSON.stringify(rows, null, 2) + "\n");
  return path;
}
/** Load the committed deck: every card from fixtures/cards, sorted by id. Zero network. */
export function loadDeck(dir = CARDS_DIR): Card[] {
  return listCardFixtures(dir)
    .map((p) => readCardFixture(p).card)
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function deckExists(dir = CARDS_DIR): boolean {
  return existsSync(dir) && listCardFixtures(dir).length > 0;
}
