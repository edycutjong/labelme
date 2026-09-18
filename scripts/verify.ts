/**
 * Replay every recorded card OFFLINE and prove the engine is deterministic: same responses + same clock → same clues,
 * same tell, same reader guess, same cardHash; zero network calls, zero credits. Also checks deck.json matches the
 * card files. Exit 1 on any mismatch.
 *
 *   npm run verify                # NANSEN_OFFLINE is forced; no API key needed
 *   npm run verify -- --update    # after an output-only engine change (tell wording, hash projection): rebuild every
 *                                 # card FROM THE UNTOUCHED RECORDED RESPONSES and rewrite deck.json, 0 credits
 */
import { readFileSync } from "node:fs";
import {
  CachedNansenClient,
  listCardFixtures,
  readCardFixture,
  fixtureStore,
  buildCard,
  deckHash,
  loadDeck,
  cardProjection,
  writeCardFixture,
  writeDeckFile,
  DECK_CLASSES,
  type DeckFile,
} from "../packages/core/src/index.js";

process.env.NANSEN_OFFLINE = "1";
const UPDATE = process.argv.includes("--update");
const files = listCardFixtures();
if (files.length === 0) {
  console.error("no fixtures/cards — run `npm run seed` first");
  process.exit(1);
}
let ok = 0;
const failures: string[] = [];
for (const path of files) {
  const f = readCardFixture(path);
  const client = new CachedNansenClient("nsn_offline_replay_000000000000000", { store: fixtureStore(f), offline: true });
  const problems: string[] = [];
  try {
    const { card } = await buildCard(
      client,
      { address: f.card.address, class: f.card.class, nansenLabel: f.card.nansenLabel, entity: f.card.entity, source: f.card.source },
      f.now,
    );
    if (UPDATE && card.cardHash !== f.card.cardHash) {
      writeCardFixture({ ...f, card: { ...card, recordedAt: f.card.recordedAt } });
      console.log(`updated ${path}: ${f.card.cardHash.slice(0, 12)} → ${card.cardHash.slice(0, 12)}`);
      f.card = { ...card, recordedAt: f.card.recordedAt };
    }
    if (card.cardHash !== f.card.cardHash) problems.push(`cardHash ${card.cardHash.slice(0, 12)} ≠ recorded ${f.card.cardHash.slice(0, 12)}`);
    if (JSON.stringify(cardProjection(card)) !== JSON.stringify(cardProjection(f.card))) problems.push("clues/tell/reader differ from the recorded card");
    if (card.id !== f.card.id) problems.push("id differs");
    const network = client.calls.filter((c) => !c.cached);
    if (network.length) problems.push(`${network.length} call(s) left the cache: ${network.map((c) => c.endpoint).join(", ")}`);
    if (client.creditsSpent !== 0) problems.push(`${client.creditsSpent} credits spent on a replay`);
    if (client.calls.length !== 4) problems.push(`${client.calls.length} calls replayed (want 4)`);
  } catch (e) {
    problems.push(`threw: ${(e as Error).message.slice(0, 160)}`);
  }
  if (JSON.stringify(f).includes(process.env.NANSEN_API_KEY ?? " never")) problems.push("fixture contains the API key");
  if (problems.length) failures.push(`${path}: ${problems.join(" · ")}`);
  else ok++;
}
const deck = loadDeck();
if (UPDATE) {
  const prev = JSON.parse(readFileSync("fixtures/deck.json", "utf8")) as DeckFile;
  writeDeckFile({
    ...prev,
    cards: deck.length,
    byClass: Object.fromEntries(DECK_CLASSES.map((k) => [k, deck.filter((c) => c.class === k).length])),
    deckHash: deckHash(deck),
    ids: deck.map((c) => c.id),
  });
}
const deckFile = JSON.parse(readFileSync("fixtures/deck.json", "utf8")) as DeckFile;
if (deckFile.deckHash !== deckHash(deck))
  failures.push(`fixtures/deck.json deckHash ${deckFile.deckHash.slice(0, 12)} ≠ cards ${deckHash(deck).slice(0, 12)} — re-run seed`);
if (deckFile.cards !== deck.length) failures.push(`deck.json says ${deckFile.cards} cards, ${deck.length} on disk`);
console.log(`${ok}/${files.length} cards reproduced offline · deck ${deckHash(deck).slice(0, 12)} · ${JSON.stringify(deckFile.byClass)}`);
for (const f of failures) console.error(`✗ ${f}`);
process.exit(failures.length ? 1 : 0);
