import { CLASS_INFO, DECK_CLASSES, fmtUsd, pct, type Card, type Clues, type Call, type LabelClass } from "@labelme/core";

export const G = "\x1b[32m",
  R = "\x1b[31m",
  Y = "\x1b[33m",
  D = "\x1b[2m",
  B = "\x1b[1m",
  X = "\x1b[0m";

const signed = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${fmtUsd(n)}`);
const plus = (n: number, capped: boolean) => `${n}${capped ? "+" : ""}`;

/** The card face: four clue rows, no label, no address. */
export function renderFace(c: Clues, title: string): string {
  const p = c.pnl,
    t = c.trades,
    b = c.balance,
    k = c.counterparties;
  const lines = [`${B}${title}${X}`];
  lines.push(
    `${D}PnL 30d ${X}   ${p.ok ? `realised ${signed(p.realizedUsd)} · win rate ${pct(p.winRate)} · ${p.trades} trades · ${p.tokensTraded} tokens${p.top.length ? ` · top: ${p.top.map((x) => `${x.symbol} ${x.roi === null ? "" : pct(x.roi)}`.trim()).join(", ")}` : ""}` : `${R}unavailable${X}`}`,
  );
  lines.push(
    `${D}Trades  ${X}   ${t.ok ? (t.rows.length ? t.rows.map((r) => `${r.symbol} ${signed(r.pnlUsd)} (${r.buys}b/${r.sells}s)`).join(" · ") : "none in 30 d") : `${R}unavailable${X}`}`,
  );
  lines.push(
    `${D}Balance ${X}   ${b.ok ? `${plus(b.tokens, b.tokensCapped)} tokens · ${fmtUsd(b.totalUsd)}${b.topSymbol ? ` · top ${b.topSymbol} ${pct(b.topShare)}` : ""} · stables ${pct(b.stableShare)}` : `${R}unavailable${X}`}`,
  );
  lines.push(
    `${D}Counterp.${X}  ${k.ok ? `${plus(k.count, k.countCapped)} in 30 d · ${k.interactions} interactions · top outflow ${pct(k.topOutShare)} · DEX ${pct(Math.min(1, k.mix.pool + k.mix.activity))} · wealth-tagged ${pct(k.mix.wealth + k.mix.entity)} · contracts ${pct(k.mix.contract)} · unlabelled ${pct(k.mix.unlabelled)}` : `${R}unavailable${X}`}`,
  );
  return lines.join("\n");
}

export function renderChoices(): string {
  return DECK_CLASSES.map((k, i) => `${D}[${i + 1}]${X} ${CLASS_INFO[k].name}`).join("  ");
}

export function renderReveal(card: Card, guess?: LabelClass): string {
  const ok = guess === card.class;
  const head = guess ? (ok ? `${G}${B}✔ correct${X}` : `${R}${B}✖ ${CLASS_INFO[guess].name}${X}`) : "";
  return [
    `${head}${guess ? " — " : ""}${B}${CLASS_INFO[card.class].name}${X}${card.entity ? ` · ${card.entity}` : ""}${card.nansenLabel ? ` · tag "${card.nansenLabel}"` : ""}`,
    `${D}${card.address} · Nansen said so via ${card.source.endpoint}${card.source.labelType ? ` label_type=${card.source.labelType}` : ""}${card.source.token ? ` on ${card.source.token}` : ""}${X}`,
    `${D}tell:${X} ${card.tell}`,
  ].join("\n");
}

export function renderCall(c: Call): string {
  const st = c.cached ? `${D}cached${X}` : c.ok ? `${G}${c.status}${X}` : `${R}${c.error ?? "failed"}${X}`;
  return `  ${D}·${X} ${c.endpoint.padEnd(36)} ${String(c.credits).padStart(3)} cr  ${String(c.totalMs).padStart(5)} ms  ${st}${c.attempts > 1 ? ` ${Y}(retried)${X}` : ""}`;
}

export function classByKey(input: string): LabelClass | undefined {
  const s = input.trim().toLowerCase();
  const i = Number(s);
  if (Number.isInteger(i) && i >= 1 && i <= DECK_CLASSES.length) return DECK_CLASSES[i - 1];
  return DECK_CLASSES.find((k) => k === s || CLASS_INFO[k].name.toLowerCase().startsWith(s) || CLASS_INFO[k].short.toLowerCase() === s);
}
