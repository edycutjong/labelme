/** Spike part 2: contract/pool candidates (plain all_holders pages carry the structural tags the exclusion filter hides) + re-run pnl on the 17. */
import { cachedClientFromEnv, nansen, fetchClues, classFromTag, type HolderRow } from "../packages/core/src/index.js";
const client = cachedClientFromEnv();
const now = Date.now();
const TOKENS: Record<string, string> = { PEPE: "0x6982508145454ce325ddbe47a25d4ec3d2311933", SHIB: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce" };
const picks: { address: string; tag: string; token: string }[] = [];
for (const [sym, addr] of Object.entries(TOKENS)) {
  const h = await nansen.holders(client, addr, "all_holders_plain");
  const structural = h.data.filter((r: HolderRow) => classFromTag(r.address_label) === "contract");
  console.log(`${sym}: ${h.data.length} rows · structural: ${structural.map((r) => `${r.address!.slice(0, 8)} ${r.address_label}`).join(" · ")}`);
  for (const r of structural)
    if (picks.length < 4 && !picks.some((p) => p.address === r.address))
      picks.push({ address: r.address!.toLowerCase(), tag: r.address_label ?? "", token: sym });
}
console.log(
  "class          | tag                  | trades | win  | pnl$      | tok | tot$        | top  | stab | cps | topOut | pool | activ | wealth | unlab | int  | ms",
);
for (const p of picks) {
  const t0 = Date.now();
  const { clues: c, failures } = await fetchClues(client, p.address, now);
  const f = (x: number | null) => (x === null ? "  —  " : x.toFixed(2).padStart(5));
  console.log(
    `contract       | ${p.tag.slice(0, 20).padEnd(20)} | ${String(c.pnl.trades).padStart(6)} | ${f(c.pnl.winRate)} | ${String(c.pnl.realizedUsd ?? "—").padStart(9)} | ${String(c.balance.tokens).padStart(3)}${c.balance.tokensCapped ? "+" : " "}| ${String(c.balance.totalUsd).padStart(11)} | ${f(c.balance.topShare)} | ${f(c.balance.stableShare)} | ${String(c.counterparties.count).padStart(2)}${c.counterparties.countCapped ? "+" : " "} | ${f(c.counterparties.topOutShare)}  | ${f(c.counterparties.mix.pool)} | ${f(c.counterparties.mix.activity)} | ${f(c.counterparties.mix.wealth)}  | ${f(c.counterparties.mix.unlabelled)} | ${String(c.counterparties.interactions).padStart(4)} | ${Date.now() - t0}${failures.length ? "  ✗ " + failures.map((x) => x.section + ": " + x.error.slice(0, 80)).join("; ") : ""}`,
  );
  console.log(`   trades top: ${c.trades.rows.map((r) => `${r.symbol} ${r.pnlUsd} (${r.buys}b/${r.sells}s)`).join(" · ")}`);
}
console.log(`${client.calls.filter((c) => !c.cached).length} live calls · ${client.creditsSpent} credits`);
