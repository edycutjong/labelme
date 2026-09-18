#!/usr/bin/env -S npx tsx
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  cachedClientFromEnv,
  loadDeck,
  makeRound,
  score,
  drawCard,
  buildCard,
  read,
  allFailed,
  randomSeed,
  normalizeSeed,
  CLASS_INFO,
  DECK_CLASSES,
  type Card,
  type LabelClass,
} from "@labelme/core";
import { renderFace, renderChoices, renderReveal, renderCall, classByKey, G, R, D, B, X, Y } from "./render.js";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
/** the value after a flag; a following flag is not a value (`--seed --answers` is an absent seed, not the seed "--answers") */
const opt = (k: string) => {
  const v = args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
  return v === undefined || v.startsWith("--") ? undefined : v;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--seed", "--class"].includes(args[i - 1])));
const cmd = positional[0];

const usage = `usage: labelme play [--seed <word>] [--json] [--answers]
       labelme draw [--class smart-money|exchange|whale|contract|regular] [--seed <word>] [--json] [--explain] [--no-cache]
       labelme card <0xaddress> [--json] [--explain] [--no-cache]

  play   deal 10 cards from the committed deck (0 credits) and guess the Nansen label; --answers prints the answer key
  draw   pull ONE unseen labelled wallet live from Nansen (13 credits) — needs NANSEN_API_KEY (source ~/.config/nansen/meridian.env)
  card   the four clue calls on any ethereum address (8 credits) + what the house rule reads`;

if (!cmd || flags.has("--help") || !["play", "draw", "card"].includes(cmd)) {
  console.log(usage);
  process.exit(cmd ? 0 : 1);
}

const deck = loadDeck();
const byId = new Map(deck.map((c) => [c.id, c]));

if (cmd === "play") {
  if (deck.length === 0) {
    console.error("no deck on disk — run `npm run seed` (needs a key) or clone the repo with fixtures/");
    process.exit(1);
  }
  const seed = normalizeSeed(opt("--seed")) || randomSeed();
  const round = makeRound(deck, seed);
  const cards = round.cardIds.map((id) => byId.get(id)!);
  if (flags.has("--json")) {
    console.log(
      JSON.stringify(
        { round, cards: flags.has("--answers") ? cards : cards.map((c) => ({ id: c.id, chain: c.chain, clues: c.clues, cardHash: c.cardHash })) },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  console.log(`\n${B}Label Me${X} — ${D}round ${seed} · deck ${round.deckHash.slice(0, 12)} · ${deck.length} cards on disk · 0 credits${X}\n`);
  const interactive = stdin.isTTY && !flags.has("--answers");
  const rl = interactive ? createInterface({ input: stdin, output: stdout }) : undefined;
  const guesses: Record<string, LabelClass> = {};
  let streak = 0;
  for (const [i, card] of cards.entries()) {
    console.log(renderFace(card.clues, `Wallet ${i + 1} of ${cards.length} · ${card.chain}`));
    if (rl) {
      console.log(renderChoices());
      let g: LabelClass | undefined;
      while (!g) g = classByKey(await rl.question(`${D}your guess (1-${DECK_CLASSES.length}):${X} `));
      guesses[card.id] = g;
      streak = g === card.class ? streak + 1 : 0;
      console.log(renderReveal(card, g) + (streak > 1 ? `  ${Y}streak ${streak}${X}` : "") + "\n");
    } else {
      console.log(`${D}→${X} ${renderReveal(card)}\n`);
    }
  }
  rl?.close();
  if (interactive) {
    const s = score(round, byId, guesses);
    const house = cards.filter((c) => read(c.clues).guess === c.class).length;
    console.log(
      `${B}You read wallets ${s.correct}/${s.total}${X}${s.streakBest > 1 ? ` · best streak ${s.streakBest}` : ""} · ${D}the house rule got ${house}/${s.total}${X}`,
    );
    console.log(`${D}per class: ${DECK_CLASSES.map((k) => `${CLASS_INFO[k].short} ${s.perClass[k].right}/${s.perClass[k].seen}`).join(" · ")}${X}`);
    console.log(`${D}share: /r/${seed} · replay: npm run labelme -- play --seed ${seed}${X}`);
  } else {
    const house = cards.filter((c) => read(c.clues).guess === c.class).length;
    console.log(`${D}answer key printed (not a TTY or --answers) · the house rule reads ${house}/${cards.length} of this round${X}`);
  }
  process.exit(0);
}

const cardAddress = (positional[1] ?? "").trim().toLowerCase();
if (cmd === "card" && !/^0x[0-9a-f]{40}$/.test(cardAddress)) {
  console.error(`card needs an ethereum address (0x + 40 hex chars), got ${JSON.stringify(positional[1] ?? "")}`);
  process.exit(1);
}
// REGRESSION (audit 2026-09-19): a judge who skipped the `export NANSEN_API_KEY=…` line got a Node stack trace, not a sentence
if (!/^nsn_/.test(process.env.NANSEN_API_KEY ?? "")) {
  console.error(
    `${R}${B}NANSEN_API_KEY is not set${X} ${D}— \`${cmd}\` calls Nansen live. Get a key at https://app.nansen.ai/api, then:${X}\n  export NANSEN_API_KEY=nsn_…   ${D}(the deck round needs none: npm run labelme -- play)${X}`,
  );
  process.exit(1);
}
const client = cachedClientFromEnv({ ttlMs: flags.has("--no-cache") ? 0 : undefined });

if (cmd === "draw") {
  const cls = opt("--class") as LabelClass | undefined;
  if (cls && !DECK_CLASSES.includes(cls)) {
    console.error(`--class must be one of ${DECK_CLASSES.join(", ")}`);
    process.exit(1);
  }
  const t0 = Date.now();
  if (!flags.has("--json")) console.log(`\n${B}Draw fresh${X} ${D}— one unseen ${cls ?? "random-class"} wallet, live from Nansen${X}`);
  let card: Card | undefined;
  try {
    const r = await drawCard(client, {
      class: cls,
      seed: opt("--seed"),
      exclude: new Set(deck.map((c) => c.address)),
      onProgress: (e) => {
        if (flags.has("--json")) return;
        if (e.type === "call") console.log(renderCall(e.call));
        if (e.type === "picked") console.log(`  ${D}picked from ${e.candidates} unseen candidates${X}`);
      },
    });
    card = r.card;
  } catch (e) {
    const failed = client.calls.filter((c) => !c.ok);
    if (flags.has("--json")) console.log(JSON.stringify({ error: (e as Error).message, provenance: client.calls }, null, 2));
    else
      console.log(`${R}Nansen busy — try again${X} ${D}(${(e as Error).message.slice(0, 140)}${failed.length ? `; ${failed.length} failed call(s)` : ""})${X}`);
    process.exit(2);
  }
  const ms = Date.now() - t0;
  if (flags.has("--json")) {
    console.log(
      JSON.stringify(
        {
          card,
          house: read(card.clues),
          credits: client.creditsSpent,
          calls: client.calls.length,
          ms,
          provenance: flags.has("--explain") ? client.calls : undefined,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  console.log("\n" + renderFace(card.clues, `Fresh card · ${card.chain}`));
  console.log(`${D}→${X} ${renderReveal(card)}`);
  const h = read(card.clues);
  console.log(`${D}house rule reads:${X} ${h.guess === card.class ? G : R}${CLASS_INFO[h.guess].name}${X} ${D}— ${h.because}${X}`);
  const cached = client.calls.filter((c) => c.cached).length;
  console.log(
    `${D}${client.creditsSpent} credits · ${client.calls.length} calls (${cached} cached) · ${(ms / 1000).toFixed(1)} s · card ${card.cardHash.slice(0, 12)}${X}`,
  );
  process.exit(0);
}

if (cmd === "card") {
  const address = cardAddress;
  const known = deck.find((c) => c.address === address);
  const t0 = Date.now();
  const { card, failures } = await buildCard(
    client,
    {
      address,
      class: known?.class ?? "regular",
      nansenLabel: known?.nansenLabel ?? "",
      entity: known?.entity ?? null,
      source: known?.source ?? { endpoint: "profiler/*", labelType: null, token: null, tag: "" },
    },
    Date.now(),
  );
  const h = read(card.clues);
  if (flags.has("--json")) {
    console.log(
      JSON.stringify(
        {
          address,
          clues: card.clues,
          house: h,
          nansen: known ? { class: known.class, label: known.nansenLabel, entity: known.entity, source: known.source } : null,
          credits: client.creditsSpent,
          calls: client.calls.length,
          ms: Date.now() - t0,
          failures,
          provenance: flags.has("--explain") ? client.calls : undefined,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  console.log("\n" + renderFace(card.clues, `${address} · ethereum`));
  for (const f of failures) console.log(`${R}✗ ${f.section}: ${f.error}${X}`);
  // REGRESSION (review pass 1): an address every Nansen call refused (a burn address → HTTP 422) is not "a regular wallet"
  if (allFailed(card.clues)) console.log(`${R}${B}no clues${X} ${D}— every Nansen call failed for this address; nothing to read${X}`);
  else console.log(`${D}house rule reads:${X} ${B}${CLASS_INFO[h.guess].name}${X} ${D}— ${h.because}${X}`);
  if (known)
    console.log(
      `${D}Nansen (from the deck):${X} ${G}${CLASS_INFO[known.class].name}${X}${known.entity ? ` · ${known.entity}` : ""}${known.nansenLabel ? ` · tag "${known.nansenLabel}"` : ""}`,
    );
  else
    console.log(
      `${D}Nansen's label for an arbitrary address is a 100-credit call (profiler/address/labels) — not made. The answer key exists for wallets Nansen has grouped: try \`draw\`.${X}`,
    );
  if (flags.has("--explain")) for (const c of client.calls) console.log(renderCall(c));
  console.log(`${D}${client.creditsSpent} credits · ${client.calls.length} calls · ${((Date.now() - t0) / 1000).toFixed(1)} s${X}`);
  process.exit(0);
}
