/** The browser-safe surface of the engine: pure modules only (no node:fs / node:crypto). Client components import from here. */
export { CLASS_INFO, PRECEDENCE, counterpartyClass, classFromTag, classFromEntity, tagIsNeutral, isPoolTag } from "./classes.js";
export type { LabelClass, ClassInfo, CounterpartyClass } from "./classes.js";
export { fmtUsd, pct } from "./format.js";
export { normalizeSeed } from "./seed.js";
export { DECK_CLASSES } from "./constants.js";
export type { Clues, ClueFailure } from "./clues.js";
export { allFailed } from "./clues.js";
export type { Card, CardFace, Source } from "./card.js";
export type { Call } from "./client.js";
export type { DrawEvent } from "./draw.js";
