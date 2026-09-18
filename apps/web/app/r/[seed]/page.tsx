import type { Metadata } from "next";
import { normalizeSeed } from "@labelme/core";
import { SiteHeader, SiteFooter } from "@/components/Shell";
import { Game } from "@/components/Game";
import { roundFor } from "@/lib/deck";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ seed: string }>; searchParams: Promise<{ score?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const seed = normalizeSeed(decodeURIComponent((await params).seed)) || "meridian";
  const s = Number((await searchParams).score);
  const score = Number.isInteger(s) && s >= 0 && s <= 10 ? s : null;
  const title = score === null ? `Label Me — round ${seed}` : `I read wallets ${score}/10 — can you?`;
  const description = "Ten real ethereum wallets, four Nansen clues each. Guess the label; the reveal is Nansen's.";
  const image = `/api/og?seed=${seed}${score === null ? "" : `&score=${score}`}`;
  return { title, description, openGraph: { title, description, images: [image], url: `/r/${seed}` }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

/** Permalink: the same ten cards for anyone who opens the link (server-dealt, 0 credits). */
export default async function RoundPage({ params }: Props) {
  const seed = normalizeSeed(decodeURIComponent((await params).seed)) || "meridian";
  const round = roundFor(seed);
  return (
    <>
      <SiteHeader current="home" />
      <main className="wrap">
        <Game initialRound={round} />
      </main>
      <SiteFooter />
    </>
  );
}
