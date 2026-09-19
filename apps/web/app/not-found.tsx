import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Label Me — nothing here",
  description: "That URL is not a card. The game lives at /, the judge page at /judge, and every round at /r/<seed>.",
  robots: { index: false, follow: true },
};

/** The 404 — same header and footer as the game, so a mistyped link still lands somewhere that explains itself. */
export default function NotFound() {
  return (
    <>
      <SiteHeader current="home" />
      <main className="wrap judge">
        <p className="judge-kicker">404 · not a card</p>
        <h1>
          Nothing <span className="real">here</span>.
        </h1>
        <p className="judge-lede">
          That address isn&apos;t one of the ten wallets, and it isn&apos;t a page either. Label Me has exactly three kinds of URL: the game at <code>/</code>,
          the judge page at <code>/judge</code>, and a round permalink shaped <code>/r/&lt;seed&gt;</code> — for example{" "}
          <Link href="/r/meridian1933">
            <code>/r/meridian1933</code>
          </Link>
          , the recorded round everyone gets the same ten cards from.
        </p>
        <div className="actions">
          <Link href="/" className="btn primary">
            Deal a round
          </Link>
          <Link href="/judge" className="btn">
            For the judge
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
