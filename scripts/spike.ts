/**
 * Day-one spike (specs/spec.md "Risks and the day-one spike"): 20 wallets across the six candidate classes, the four
 * cheap clue calls each — do the cheap clues separate the classes? Also: does `premium_labels=true` return 200 on the
 * free plan, and does the 1-credit tx-lookup label carry an entity name for an exchange holder?
 *
 *   source ~/.config/nansen/meridian.env && npm run spike            # ~190 credits; responses land in .cache/ and are reused by seed
 *
 * Output: a table on stdout (tee it into ../specs/spike-raw.txt); the findings are written by hand to ../specs/spike.md.
 */
import {
  cachedClientFromEnv,
  nansen,
  fetchClues,
  classFromTag,
  tagIsNeutral,
  STRUCTURAL_TAG,
  type LabelClass,
  type HolderRow,
} from "../packages/core/src/index.js";

const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";
const client = cachedClientFromEnv();
const now = Date.now();
const args = new Set(process.argv.slice(2));

type Pick = { cls: LabelClass; address: string; tag: string; src: string };
const picks: Pick[] = [];
const seen = new Map<string, Set<LabelClass>>();
const note = (addr: string, cls: LabelClass) => {
  const a = addr.toLowerCase();
  if (!seen.has(a)) seen.set(a, new Set());
  seen.get(a)!.add(cls);
};

console.log("── sourcing (PEPE, ethereum) ──");
const [sm, ex, pf, all, wb, smt] = await Promise.all([
  nansen.holders(client, PEPE, "smart_money"),
  nansen.holders(client, PEPE, "exchange"),
  nansen.holders(client, PEPE, "public_figure"),
  nansen.holders(client, PEPE, "all_holders"),
  nansen.whoBought(client, PEPE, now),
  nansen.smartMoneyTrades(client),
]);
for (const r of sm.data) note(r.address!, "smart-money");
for (const r of ex.data) note(r.address!, "exchange");
for (const r of pf.data) note(r.address!, "public-figure");
for (const r of smt.data) note(r.trader_address, "smart-money");
console.log(
  `smart_money ${sm.data.length} rows · exchange ${ex.data.length} · public_figure ${pf.data.length} · all_holders(excl) ${all.data.length} · who-bought(excl) ${wb.data.length} · sm dex-trades ${smt.data.length} (${new Set(smt.data.map((t) => t.trader_address)).size} traders)`,
);

const only = (addr: string, cls: LabelClass) => seen.get(addr.toLowerCase())?.size === 1 && seen.get(addr.toLowerCase())!.has(cls);
const take = (rows: HolderRow[], cls: LabelClass, want: number, src: string, filter: (r: HolderRow) => boolean = () => true) => {
  for (const r of rows) {
    if (picks.length && picks.some((p) => p.address === r.address!.toLowerCase())) continue;
    if (!filter(r)) continue;
    if (!only(r.address!, cls)) continue;
    picks.push({ cls, address: r.address!.toLowerCase(), tag: r.address_label ?? "", src });
    if (picks.filter((p) => p.cls === cls).length >= want) return;
  }
};
// class lists (by construction)
take(sm.data, "smart-money", 2, "holders:smart_money", (r) => !STRUCTURAL_TAG.test(r.address_label ?? ""));
const traders = [...new Map(smt.data.map((t) => [t.trader_address.toLowerCase(), t])).values()].map((t) => ({
  address: t.trader_address,
  address_label: t.trader_address_label ?? "",
}));
take(traders as HolderRow[], "smart-money", 4, "smart-money/dex-trades", (r) => !STRUCTURAL_TAG.test(r.address_label ?? ""));
take(ex.data, "exchange", 4, "holders:exchange");
take(pf.data, "public-figure", 3, "holders:public_figure");
// tag-based classes from the all_holders page (every label group excluded server-side)
for (const r of all.data) {
  const c = classFromTag(r.address_label);
  if (c) note(r.address!, c);
}
take(all.data, "whale", 3, "holders:all_holders(excl) wealth tag", (r) => classFromTag(r.address_label) === "whale");
take(all.data, "contract", 3, "holders:all_holders(excl) structural tag", (r) => classFromTag(r.address_label) === "contract");
// regular: excluded from every label group AND a neutral tag
const regulars = wb.data.filter((r) => tagIsNeutral(r.address_label)).map((r) => ({ address: r.address, address_label: r.address_label ?? "" }));
for (const r of regulars) note(r.address, "regular");
take(regulars as HolderRow[], "regular", 3, "who-bought-sold(excl)");

console.log(`\n${picks.length} wallets picked:`);
for (const p of picks) console.log(`  ${p.cls.padEnd(14)} ${p.address} ${JSON.stringify(p.tag).padEnd(24)} ${p.src}`);

console.log("\n── clues (4 calls each) ──");
const rows: string[] = [];
const hdr =
  "class          | tag                  | trades | win  | pnl$      | tok | tot$        | top  | stab | cps | topOut | pool | wealth | ens  | unlab | int  | ms";
console.log(hdr);
for (const p of picks) {
  const t0 = Date.now();
  const { clues: c, failures } = await fetchClues(client, p.address, now);
  const ms = Date.now() - t0;
  const f = (x: number | null, d = 2) => (x === null ? "  —  " : x.toFixed(d).padStart(5));
  const line = `${p.cls.padEnd(14)} | ${p.tag.slice(0, 20).padEnd(20)} | ${String(c.pnl.trades).padStart(6)} | ${f(c.pnl.winRate)} | ${String(c.pnl.realizedUsd ?? "—").padStart(9)} | ${String(c.balance.tokens).padStart(3)}${c.balance.tokensCapped ? "+" : " "}| ${String(c.balance.totalUsd).padStart(11)} | ${f(c.balance.topShare)} | ${f(c.balance.stableShare)} | ${String(c.counterparties.count).padStart(2)}${c.counterparties.countCapped ? "+" : " "} | ${f(c.counterparties.topOutShare)}  | ${f(c.counterparties.mix.pool)} | ${f(c.counterparties.mix.wealth)}  | ${f(c.counterparties.mix.ens)} | ${f(c.counterparties.mix.unlabelled)} | ${String(c.counterparties.interactions).padStart(4)} | ${ms}${failures.length ? `  ✗ ${failures.map((x) => `${x.section}: ${x.error}`).join("; ")}` : ""}`;
  console.log(line);
  rows.push(line);
}

if (args.has("--premium")) {
  console.log("\n── premium_labels=true on the free plan (once; 150 cr if accepted) ──");
  try {
    const r = await client.post<unknown>(
      "tgm/holders",
      { chain: "ethereum", token_address: PEPE, premium_labels: true, pagination: { page: 1, per_page: 3 } },
      [],
    );
    console.log("HTTP 200 — accepted; rows:", JSON.stringify(r).slice(0, 400));
  } catch (e) {
    console.log("refused:", (e as Error).message.slice(0, 300));
  }
}
if (args.has("--entity")) {
  console.log("\n── entity label via transactions (1) + tx-lookup (1) on the first exchange pick ──");
  const exch = picks.find((p) => p.cls === "exchange");
  if (exch) {
    try {
      const tx = await nansen.transactions(client, exch.address, now);
      const h = tx.data?.[0]?.transaction_hash;
      console.log("tx rows", tx.data?.length ?? 0, "first hash", h);
      if (h) {
        const l = await nansen.txLookup(client, h);
        const d = l.data?.[0];
        console.log(
          "from:",
          d?.from_address_label,
          "| to:",
          d?.to_address_label,
          "| transfers:",
          (d?.token_transfer_array ?? []).slice(0, 3).map((t) => `${t.from_address_label} → ${t.to_address_label}`),
        );
      }
    } catch (e) {
      console.log("failed:", (e as Error).message.slice(0, 200));
    }
  }
}

const live = client.calls.filter((c) => !c.cached);
const failed = client.calls.filter((c) => !c.ok);
console.log(
  `\n${client.calls.length} calls · ${live.length} live · ${client.creditsSpent} credits · ${failed.length} failed${failed.length ? ": " + failed.map((c) => `${c.endpoint} ${c.error}`).join("; ") : ""}`,
);
console.log(
  `slowest: ${[...client.calls]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 5)
    .map((c) => `${c.endpoint} ${(c.totalMs / 1000).toFixed(1)}s`)
    .join(" · ")}`,
);
