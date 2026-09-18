/**
 * The label classes a player can guess, and how a Nansen row maps to one.
 * The candidate set is six; the spike (specs/spike.md) decides which survive — see CLASSES.
 */
export type LabelClass = "smart-money" | "exchange" | "whale" | "contract" | "public-figure" | "regular";

/** precedence when an address shows up in more than one sourcing list (higher first) */
export const PRECEDENCE: LabelClass[] = ["exchange", "smart-money", "public-figure", "whale", "contract", "regular"];

export type ClassInfo = { id: LabelClass; name: string; short: string; hue: string; howNansenSaysIt: string };
export const CLASS_INFO: Record<LabelClass, ClassInfo> = {
  "smart-money": { id: "smart-money", name: "Smart Money", short: "SM", hue: "#a78bfa", howNansenSaysIt: "tgm/holders label_type=smart_money (Fund / Smart Trader tiers) or smart-money/dex-trades" },
  exchange: { id: "exchange", name: "Exchange", short: "CEX", hue: "#38bdf8", howNansenSaysIt: "tgm/holders label_type=exchange" },
  whale: { id: "whale", name: "Whale", short: "Whale", hue: "#f59e0b", howNansenSaysIt: "tgm/holders free tag: Token Billionaire / Token Millionaire / <X> Whale / High Balance" },
  contract: { id: "contract", name: "Contract / Pool", short: "Contract", hue: "#94a3b8", howNansenSaysIt: "tgm/holders free tag: Liquidity Pool / Uniswap / Token Contract / Proxy / MultiSig / Deployer" },
  "public-figure": { id: "public-figure", name: "Public Figure", short: "Public", hue: "#f472b6", howNansenSaysIt: "tgm/holders label_type=public_figure" },
  regular: { id: "regular", name: "Regular wallet", short: "Regular", hue: "#e6edf3", howNansenSaysIt: "tgm/who-bought-sold with all 17 Nansen label groups excluded" },
};

/** free-tier `address_label` patterns (observed live 2026-09-16/18 across whichone, sentwrong and this project's probes) */
export const STRUCTURAL_TAG = /liquidity pool|uniswap|sushi|curve|balancer|pancake|router|token contract|\bproxy\b|multisig|multi-sig|deployer|\bvault\b|staking|bridge|\bcontract\b|gnosis safe|\bsafe\b/i;
export const WEALTH_TAG = /billionaire|millionaire|whale|high balance/i;
export const ACTIVITY_TAG = /high activity/i;
export const ENS_TAG = /\.(eth|sol|base\.eth)\*?$|on opensea|referral code/i;
/** an entity name: exchange/fund/protocol labels carry emoji prefixes or a "Name: role" shape; only seen on tx-lookup labels so far */
export const ENTITY_TAG = /🏦|🤖|🐋|binance|coinbase|kraken|okx|bybit|bitget|kucoin|gate\.io|huobi|htx|robinhood|crypto\.com|gemini|bitfinex|upbit|mexc|:\s*(deposit|hot wallet|cold wallet)/i;

export type CounterpartyClass = "pool" | "contract" | "wealth" | "activity" | "ens" | "entity" | "other" | "unlabelled";

/** Bucket a counterparty's labels (the OTHER side of a transfer) into a class the card can show without leaking the wallet's own label. */
export function counterpartyClass(labels: string[] | null | undefined): CounterpartyClass {
  const list = (labels ?? []).map((l) => l.trim()).filter(Boolean);
  if (list.length === 0) return "unlabelled";
  const joined = list.join(" | ");
  if (/liquidity pool|uniswap|sushi|curve|balancer|pancake|router|aggregator|1inch|paraswap|cow ?swap|kyber|0x /i.test(joined)) return "pool";
  if (ENTITY_TAG.test(joined)) return "entity";
  if (STRUCTURAL_TAG.test(joined)) return "contract";
  if (WEALTH_TAG.test(joined)) return "wealth";
  if (ACTIVITY_TAG.test(joined)) return "activity";
  if (ENS_TAG.test(joined)) return "ens";
  return "other";
}

/** Map a free-tier holder tag to a class for the tag-based classes (whale / contract). Undefined = not decidable from the tag. */
export function classFromTag(tag: string | null | undefined): "whale" | "contract" | undefined {
  const t = (tag ?? "").trim();
  if (!t || ENS_TAG.test(t)) return undefined;
  if (STRUCTURAL_TAG.test(t)) return "contract";
  if (WEALTH_TAG.test(t)) return "whale";
  return undefined;
}

/** True when a tag says nothing about class (empty, ENS name, activity tag) — the only tags allowed on a "regular" card. */
export function tagIsNeutral(tag: string | null | undefined): boolean {
  const t = (tag ?? "").trim();
  return !t || ENS_TAG.test(t) || ACTIVITY_TAG.test(t);
}

/** Resolve one class for an address seen in several sourcing lists: highest precedence wins; `ambiguous` when a tag contradicts. */
export function resolveClass(seen: Set<LabelClass>): LabelClass | undefined {
  for (const c of PRECEDENCE) if (seen.has(c)) return c;
  return undefined;
}
