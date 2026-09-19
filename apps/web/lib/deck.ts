// server-side only: reads fixtures from disk (never imported by a client component — the browser surface is @labelme/core/browser)
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadDeck,
  makeRound,
  read,
  face,
  readCardFixture,
  fixtureStore,
  CachedNansenClient,
  buildCard,
  type Card,
  type CardFace,
  type Call,
} from "@labelme/core";

/** The committed deck, read once per instance from fixtures/cards (0 network). */
let cache: { cards: Card[]; byId: Map<string, Card>; house: number } | undefined;
function dir(): string {
  for (const c of [join(process.cwd(), "fixtures", "cards"), join(process.cwd(), "..", "..", "fixtures", "cards")]) if (existsSync(c)) return c;
  return join(process.cwd(), "fixtures", "cards");
}
export function deck() {
  if (!cache) {
    const cards = loadDeck(dir());
    cache = { cards, byId: new Map(cards.map((c) => [c.id, c])), house: cards.filter((c) => read(c.clues).guess === c.class).length };
  }
  return cache;
}
export type RoundPayload = { seed: string; deckHash: string; deckSize: number; cards: CardFace[]; house: number; recordedAt: string };
/** Ten faces for a seed — answers stay on the server until /api/reveal. `house` = how many of the ten the rule reads right. */
export function roundFor(seed: string): RoundPayload {
  const d = deck();
  const r = makeRound(d.cards, seed);
  const cards = r.cardIds.map((id) => d.byId.get(id)!);
  return {
    seed: r.seed,
    deckHash: r.deckHash,
    deckSize: d.cards.length,
    cards: cards.map(face),
    house: cards.filter((c) => read(c.clues).guess === c.class).length,
    recordedAt: cards[0]?.recordedAt ?? "",
  };
}
/**
 * The four Nansen calls behind one recorded card, replayed through the engine exactly as `npm run verify` does
 * (CachedNansenClient, offline, the fixture's own responses and clock) — so the rail's "replayed · 0 cr" rows are
 * real `Call` objects from the same code path as a live draw, never hand-written. Cached per address; 0 network.
 */
const replays = new Map<string, Call[]>();
export async function replayCalls(address: string): Promise<Call[]> {
  const hit = replays.get(address);
  if (hit) return hit;
  const c = deck().cards.find((x) => x.address === address);
  if (!c) return [];
  try {
    const f = readCardFixture(join(dir(), `${address}.json`));
    const client = new CachedNansenClient("nsn_offline_replay_000000000000000", { store: fixtureStore(f), offline: true });
    await buildCard(client, { address: c.address, class: c.class, nansenLabel: c.nansenLabel, entity: c.entity, source: c.source }, f.now);
    const calls = client.calls.filter((k) => k.cached);
    replays.set(address, calls);
    return calls;
  } catch {
    return [];
  }
}
export type Answer = Pick<Card, "id" | "class" | "nansenLabel" | "entity" | "address" | "tell" | "source" | "recordedAt"> & {
  house: Card["class"];
  /** the recorded Nansen calls that built this card, replayed offline (rail rows: replayed · 0 cr) */
  calls: Call[];
};
export async function answerFor(id: string): Promise<Answer | undefined> {
  const c = deck().byId.get(id);
  if (!c) return undefined;
  return {
    id: c.id,
    class: c.class,
    nansenLabel: c.nansenLabel,
    entity: c.entity,
    address: c.address,
    tell: c.tell,
    source: c.source,
    recordedAt: c.recordedAt,
    house: read(c.clues).guess,
    calls: await replayCalls(c.address),
  };
}
