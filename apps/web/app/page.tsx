import { SiteHeader, SiteFooter } from "@/components/Shell";
import { Game } from "@/components/Game";
import { Example, HowItDecides } from "@/components/Example";
import { deck } from "@/lib/deck";

export const dynamic = "force-dynamic";

/** the example: the Smart Money trader with 472 trades — the card the recording opens on */
const HERO = "0x5aad9d4d54d0342385538952274590e98a9a0f6e";

export default function Home() {
  const d = deck();
  const hero = d.cards.find((c) => c.address === HERO) ?? d.cards[0];
  return (
    <>
      <SiteHeader current="home" />
      <main className="wrap">
        <Game idleChildren={hero ? <><Example card={hero} deckSize={d.cards.length} house={d.house} /><HowItDecides deckSize={d.cards.length} house={d.house} /></> : null} />
      </main>
      <SiteFooter />
    </>
  );
}
