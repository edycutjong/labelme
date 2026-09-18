import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Shell";
import { PROOF } from "@/lib/proof";
import { deck } from "@/lib/deck";
import { SITE, REPO } from "@/lib/site";

/**
 * /judge — a page built for exactly one reader. No auth, no cookies, no Nansen call, no key. Mirrored in JUDGE.md at
 * the repo root. Every number is a real-run receipt with its source next to it.
 */
export const metadata: Metadata = {
  title: "Label Me — for judges",
  description: "The claim, the 30-second path, the receipts, the real reproduce command, and the honest limitations.",
};
export const dynamic = "force-dynamic";

export default function Judge() {
  const d = deck();
  const by = (k: string) => d.cards.filter((c) => c.class === k).length;
  return (
    <>
      <SiteHeader current="judge" />
      <main className="wrap judge">
        <p className="judge-kicker">
          <Link href="/">← the game</Link> · for judges · no login, no key, no setup
        </p>
        <h1>Ten real wallets. Guess the Nansen label. The answer key is the label; the clues are Nansen&apos;s fields.</h1>
        <p className="judge-lede">
          A card game on labelled ethereum wallets: PnL summary, top trades, balance profile and the counterparty label-class mix — all Nansen-computed — and
          the reveal is Nansen&apos;s own label group, sourced by construction. The default round is a recorded deck (0 credits, 0 crash surface); &ldquo;Draw
          fresh&rdquo; pulls one unseen labelled holder live and streams the five calls as they land.
        </p>

        <h2>The 30-second path</h2>
        <ol>
          <li>
            Open{" "}
            <a href={`${SITE}/r/meridian1933`}>
              <code>{SITE}/r/meridian1933</code>
            </a>
            . Ten cards from the recorded deck, the same ten for everyone. Guess with the chips (or keys 1–5); the reveal shows the class, the free-tier tag,
            the entity name where the 1-credit lookup found one, and a one-line tell written from the card&apos;s numbers.
          </li>
          <li>
            Press <b>Draw fresh</b>: one <code>tgm/holders</code> / <code>smart-money/dex-trades</code> row and four profiler calls stream in with credits and
            latency; the card appears; guess; the house rule&apos;s read is shown next to Nansen&apos;s answer. Click <b>Provenance</b> for every call.
          </li>
          <li>
            Finish the round: &ldquo;You read wallets N/10&rdquo;, per-class breakdown, the house rule&apos;s score on the same ten, a share link whose OG card
            carries the score and the seed.
          </li>
        </ol>

        <h2>Receipts</h2>
        <table className="judge-table">
          <tbody>
            <tr>
              <th>The deck</th>
              <td>
                <b>{d.cards.length} cards</b>, ethereum — {by("smart-money")} Smart Money · {by("exchange")} exchange · {by("whale")} whale · {by("contract")}{" "}
                contract/pool · {by("regular")} regular — recorded live by <code>scripts/seed.ts</code>; every raw response committed under{" "}
                <code>fixtures/cards/</code>; <code>fixtures/dropped.json</code> lists the addresses dropped and why
              </td>
            </tr>
            <tr>
              <th>Determinism</th>
              <td>
                <code>npm run verify</code> replays all {d.cards.length} cards offline — same clues, same tell, same <code>cardHash</code> — zero network, zero
                credits
              </td>
            </tr>
            <tr>
              <th>Live draw, benchmarked</th>
              <td>
                cold p50 <b>{PROOF.coldP50s} s</b>, <b>{PROOF.creditsPerDraw} credits</b> / 5 calls per draw; out-of-sample house-reader score on the fresh
                cards — <a href={`${REPO}/blob/main/docs/BENCH.md`}>docs/BENCH.md</a> is the script&rsquo;s output
              </td>
            </tr>
            <tr>
              <th>The house rule</th>
              <td>
                a deterministic reader over the same four clues reads{" "}
                <b>
                  {d.house}/{d.cards.length}
                </b>{" "}
                of the deck (thresholds in <a href={`${REPO}/blob/main/docs/RULES.md`}>docs/RULES.md</a>, set on this deck — in-sample; the bench is
                out-of-sample)
              </td>
            </tr>
            <tr>
              <th>Nansen endpoints</th>
              <td>
                <code>tgm/holders</code> (label_type smart_money · exchange · public_figure · plain · label-excluded) · <code>tgm/who-bought-sold</code>{" "}
                (label-excluded) · <code>smart-money/dex-trades</code> · <code>profiler/address/pnl-summary</code> · <code>profiler/address/pnl</code> ·{" "}
                <code>profiler/address/current-balance</code> · <code>profiler/address/counterparties</code> · <code>profiler/address/transactions</code> +{" "}
                <code>transaction-with-token-transfer-lookup</code> (entity names)
              </td>
            </tr>
            <tr>
              <th>Tests</th>
              <td>
                <b>{PROOF.tests} tests</b> (vitest) · <b>{PROOF.propertyCases.toLocaleString("en-US")} generated cases</b> (fast-check: the reader is total, the
                tell is one line, the hash ignores time and the reader, a round is deterministic and URL-safe) · route boundary tests: garbage never reaches
                Nansen
              </td>
            </tr>
            <tr>
              <th>Clean clone → first output</th>
              <td>{PROOF.cloneSeconds ? `${PROOF.cloneSeconds} s of machine time` : "measured in README (timed clean clone)"}</td>
            </tr>
          </tbody>
        </table>

        <h2>Reproduce</h2>
        <p>The deck (0 credits, no key) and the live path (13 credits):</p>
        <pre>
          <code>{`git clone ${REPO} && cd labelme && npm install
npm run labelme -- play --seed meridian1933 --answers   # the recording's ten cards with the answer key, 0 credits
export NANSEN_API_KEY=nsn_...                        # your key from https://app.nansen.ai/api
npm run labelme -- draw --explain                    # one unseen wallet live: five calls, credits, the reveal`}</code>
        </pre>
        <p>
          <b>CI / deterministic replay</b> (not the product — a check that the engine has not drifted):
        </p>
        <pre>
          <code>{`npm run verify                                       # ${d.cards.length}/${d.cards.length} cards reproduced offline, no key, no network`}</code>
        </pre>

        <h2>Honest limitations</h2>
        <ul>
          <li>
            Free-tier <code>address_label</code> is a wealth or structural tag (Token Millionaire, Liquidity Pool), not an entity name. The class comes from the{" "}
            <code>label_type</code> filter that returned the row; entity names (🏦 Binance) appear only where the optional 1-credit tx-lookup found one.
          </li>
          <li>
            &ldquo;Regular&rdquo; is a negative: Nansen put the wallet in none of its 17 label groups. Public Figure was dropped after the spike — a person
            label is not a wallet behaviour.
          </li>
          <li>
            A dormant Smart Money wallet (0 trades this month) is unreadable from cheap clues; the deck keeps only active ones (≥ 5 trades), a live draw can
            still deal one and says so in the tell.
          </li>
          <li>Nansen latency swings by the minute; a live draw takes 2–12 s cold. The default round never touches the network.</li>
        </ul>

        <h2>Links</h2>
        <ul>
          <li>
            Live: <a href={SITE}>{SITE}</a>
          </li>
          <li>
            Repo: <a href={REPO}>{REPO}</a> — README, <a href={`${REPO}/blob/main/JUDGE.md`}>JUDGE.md</a> (this page),{" "}
            <a href={`${REPO}/blob/main/DEMO.md`}>DEMO.md</a>, <a href={`${REPO}/blob/main/docs/RULES.md`}>RULES.md</a>,{" "}
            <a href={`${REPO}/blob/main/docs/BENCH.md`}>BENCH.md</a>, <a href={`${REPO}/blob/main/docs/DX-REPORT.md`}>DX-REPORT.md</a>
          </li>
          <li>
            Built by <a href="https://x.com/edycutjong">@edycutjong</a> for the{" "}
            <a href="https://nansen.ai/campaigns/meridian-buildathon">Nansen Meridian Buildathon</a>
          </li>
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
