import { CLASS_INFO, type Card } from "@labelme/core";
import { WalletCard } from "./WalletCard";
import { PROOF } from "@/lib/proof";

/** The empty page already shows the payoff: one recorded card, revealed — the same file `npm run verify` replays. */
export function Example({ card, deckSize, house }: { card: Card; deckSize: number; house: number }) {
  return (
    <section className="example" aria-labelledby="example-h">
      <div className="example-head">
        <div>
          <h2 id="example-h">
            <span className="kicker">example</span> One card, already revealed
          </h2>
          <p className="example-sub">
            4 Nansen calls · recorded {card.recordedAt.slice(0, 10)} · replayed from <code>fixtures/cards/{card.address}.json</code> · 0 credits ·{" "}
            <code>{card.cardHash.slice(0, 12)}</code>
          </p>
        </div>
      </div>
      <WalletCard clues={card.clues} title="Wallet 1 of 10 — what the player sees" state="example">
        <div className="reveal ok example-reveal">
          <div className="reveal-head">
            <span className="badge real">the reveal</span>
            <b className="reveal-class" style={{ color: CLASS_INFO[card.class].hue }}>
              {CLASS_INFO[card.class].name}
            </b>
            {card.entity && <span className="reveal-entity">{card.entity}</span>}
            {card.nansenLabel && <span className="fact">tag “{card.nansenLabel}”</span>}
          </div>
          <p className="tell">{card.tell}</p>
          <p className="provenance">
            <span className="mono">{card.address}</span> · Nansen said so via <code>{card.source.endpoint}</code>
            {card.source.labelType ? <code>label_type={card.source.labelType}</code> : null}
          </p>
        </div>
      </WalletCard>
      <p className="example-more">
        + {deckSize - 1} more recorded cards in the deck · the house rule reads {house} of {deckSize} from the same clues
      </p>
    </section>
  );
}

export function HowItDecides({ deckSize, house }: { deckSize: number; house: number }) {
  const steps: { ep: string; cr: string; what: string; decides: string }[] = [
    {
      ep: "tgm/holders label_type=smart_money · exchange",
      cr: "5 cr",
      what: "holders in Nansen's own label groups",
      decides: "→ the answer key, by construction",
    },
    {
      ep: "tgm/holders free tags · who-bought-sold −labels",
      cr: "5 · 1 cr",
      what: "Token Billionaire, Liquidity Pool… or none of the groups",
      decides: "→ whale · contract · regular keys",
    },
    { ep: "profiler/address/pnl-summary · pnl", cr: "1 · 1 cr", what: "30-day PnL, win rate, trades, top tokens", decides: "→ the PnL and Trades clues" },
    { ep: "profiler/address/current-balance", cr: "1 cr", what: "tokens held, top position, stables", decides: "→ the Balance clue" },
    {
      ep: "profiler/address/counterparties",
      cr: "5 cr",
      what: "who it moves money with, labelled by class",
      decides: "→ the Counterparties clue and the tell",
    },
  ];
  return (
    <section className="how" aria-labelledby="how-h">
      <h2 id="how-h">How it decides — the answer is Nansen&apos;s label, the clues are Nansen&apos;s fields</h2>
      <ol className="how-grid five">
        {steps.map((s, i) => (
          <li key={s.ep} className="how-step">
            <span className="how-n">{i + 1}</span>
            <code className="how-ep">{s.ep}</code>
            <span className="how-cr">{s.cr}</span>
            <p>{s.what}</p>
            <p className="how-decides">{s.decides}</p>
          </li>
        ))}
      </ol>
      <ul className="proof-row">
        <li>
          <b>{deckSize}</b> recorded cards ·{" "}
          <b>
            {deckSize}/{deckSize}
          </b>{" "}
          replay offline
        </li>
        <li>
          <b>{PROOF.creditsPerDraw}</b> credits per live draw · <b>{PROOF.coldP50s} s</b> cold p50
        </li>
        <li>
          house rule{" "}
          <b>
            {house}/{deckSize}
          </b>{" "}
          on the deck
        </li>
        <li>
          <b>{PROOF.tests}</b> tests · <b>{PROOF.propertyCases.toLocaleString("en-US")}</b> property cases
        </li>
      </ul>
    </section>
  );
}
