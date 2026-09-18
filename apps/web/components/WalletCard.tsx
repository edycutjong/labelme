import { fmtUsd, pct, type Clues } from "@labelme/core/browser";

const signed = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${fmtUsd(n)}`);
const plus = (n: number, capped: boolean) => `${n}${capped ? "+" : ""}`;

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <b className={`stat-value${tone ? ` ${tone}` : ""}`}>{value}</b>
    </div>
  );
}

/** The face of a card: four clue groups, every number a Nansen field. No label, no address, no hint of the answer. */
export function WalletCard({
  clues,
  title,
  state,
  children,
}: {
  clues: Clues;
  title: string;
  state?: "face" | "right" | "wrong" | "example";
  children?: React.ReactNode;
}) {
  const p = clues.pnl,
    t = clues.trades,
    b = clues.balance,
    k = clues.counterparties;
  const dex = Math.min(1, k.mix.pool + k.mix.activity);
  const wealth = Math.min(1, k.mix.wealth + k.mix.entity);
  const rest = Math.max(0, 1 - dex - wealth - k.mix.contract - k.mix.unlabelled);
  return (
    <article className={`wallet ${state ?? "face"}`} aria-label={title}>
      <header className="wallet-top">
        <span className="wallet-title">{title}</span>
        <span className="badge chain">ethereum · 30 d</span>
      </header>
      <div className="clues">
        <section className="clue" aria-label="PnL, 30 days">
          <h3>PnL</h3>
          {p.ok ? (
            <>
              <div className="stats">
                <Stat
                  label="realised"
                  value={signed(p.realizedUsd)}
                  tone={p.realizedUsd === null || p.realizedUsd === 0 ? undefined : p.realizedUsd > 0 ? "up" : "down"}
                />
                <Stat label="win rate" value={pct(p.winRate)} />
                <Stat label="trades" value={String(p.trades)} />
                <Stat label="tokens traded" value={String(p.tokensTraded)} />
              </div>
              {p.top.length > 0 && (
                <ul className="facts" aria-label="top tokens by realised PnL">
                  {p.top.map((x) => (
                    <li key={x.symbol} className="fact">
                      {x.symbol} {x.roi === null ? "" : pct(x.roi)}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="clue-na">unavailable — Nansen call failed</p>
          )}
        </section>
        <section className="clue" aria-label="Top realised trades">
          <h3>Trades</h3>
          {t.ok ? (
            t.rows.length ? (
              <ul className="trades">
                {t.rows.slice(0, 4).map((r, n) => (
                  <li key={`${n}-${r.symbol}`}>
                    <span className="mono">{r.symbol}</span>
                    <span className={r.pnlUsd !== null && r.pnlUsd < 0 ? "down" : r.pnlUsd ? "up" : ""}>{signed(r.pnlUsd)}</span>
                    <span className="muted">
                      {r.buys}b / {r.sells}s
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="clue-na">no trades in 30 days</p>
            )
          ) : (
            <p className="clue-na">unavailable — Nansen call failed</p>
          )}
        </section>
        <section className="clue" aria-label="Balance">
          <h3>Balance</h3>
          {b.ok ? (
            <>
              <div className="stats">
                <Stat label="tokens" value={plus(b.tokens, b.tokensCapped)} />
                <Stat label="total" value={fmtUsd(b.totalUsd)} />
                <Stat label={b.topSymbol ? `top · ${b.topSymbol}` : "top position"} value={pct(b.topShare)} />
                <Stat label="stables" value={pct(b.stableShare)} />
              </div>
              <div className="bar" aria-hidden>
                <i style={{ width: `${Math.round((b.topShare ?? 0) * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="clue-na">unavailable — Nansen call failed</p>
          )}
        </section>
        <section className="clue" aria-label="Counterparties, 30 days">
          <h3>Counterparties</h3>
          {k.ok ? (
            <>
              <div className="stats">
                <Stat label="wallets" value={plus(k.count, k.countCapped)} />
                <Stat label="interactions" value={k.interactions.toLocaleString("en-US")} />
                <Stat label="top outflow" value={pct(k.topOutShare)} />
              </div>
              <div
                className="mixbar"
                role="img"
                aria-label={`counterparty volume: ${pct(dex)} DEX pools and routers, ${pct(wealth)} wealth-tagged or exchange wallets, ${pct(k.mix.contract)} contracts, ${pct(k.mix.unlabelled)} unlabelled`}
              >
                <i className="m-dex" style={{ width: `${dex * 100}%` }} />
                <i className="m-wealth" style={{ width: `${wealth * 100}%` }} />
                <i className="m-contract" style={{ width: `${k.mix.contract * 100}%` }} />
                <i className="m-other" style={{ width: `${rest * 100}%` }} />
                <i className="m-unlab" style={{ width: `${k.mix.unlabelled * 100}%` }} />
              </div>
              <ul className="legend" aria-hidden>
                <li>
                  <i className="m-dex" /> DEX {pct(dex)}
                </li>
                <li>
                  <i className="m-wealth" /> wealth-tagged {pct(wealth)}
                </li>
                <li>
                  <i className="m-contract" /> contracts {pct(k.mix.contract)}
                </li>
                <li>
                  <i className="m-unlab" /> unlabelled {pct(k.mix.unlabelled)}
                </li>
              </ul>
            </>
          ) : (
            <p className="clue-na">unavailable — Nansen call failed</p>
          )}
        </section>
      </div>
      {children}
    </article>
  );
}
