import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { normalizeSeed } from "@labelme/core";
import { deck } from "@/lib/deck";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLASSES = ["Smart Money", "Exchange", "Whale", "Contract / Pool", "Regular"];

/** 1200×630 share card: "I read wallets 7/10 — can you?" with the seed to replay the same ten. 0 Nansen calls, cached at the edge. */
export function GET(req: NextRequest) {
  const seed = normalizeSeed(req.nextUrl.searchParams.get("seed")) || "meridian";
  const s = Number(req.nextUrl.searchParams.get("score"));
  const score = Number.isInteger(s) && s >= 0 && s <= 10 ? s : null;
  const n = deck().cards.length;
  const headline = score === null ? "Can you read a wallet?" : `I read wallets ${score}/10 — can you?`;
  const sub = score === null ? `Ten real wallets. Guess the Nansen label.` : `round ${seed} · ten real ethereum wallets · the reveal is Nansen's label`;
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "#0a0e13",
        color: "#e6edf3",
        padding: 64,
        fontFamily: "sans-serif",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#8b9bab", fontSize: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ width: 34, height: 8, borderRadius: 3, background: "#2c3b4b" }} />
            <div style={{ width: 34, height: 8, borderRadius: 3, background: "#22c55e" }} />
            <div style={{ width: 34, height: 8, borderRadius: 3, background: "#2c3b4b" }} />
          </div>
          <span style={{ fontWeight: 800, color: "#e6edf3" }}>labelme</span>
          <span>guess the Nansen label</span>
        </div>
        <div style={{ fontSize: 68, fontWeight: 800, marginTop: 36, letterSpacing: -2, lineHeight: 1.05 }}>{headline}</div>
        <div style={{ fontSize: 26, color: "#b6c2cf", marginTop: 16 }}>{sub}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 12 }}>
          {CLASSES.map((c, i) => (
            <div
              key={c}
              style={{
                padding: "12px 20px",
                borderRadius: 999,
                border: "2px solid #2c3b4b",
                color: i === 0 && score !== null ? "#04150a" : "#b6c2cf",
                background: i === 0 && score !== null ? "#22c55e" : "transparent",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {c}
            </div>
          ))}
        </div>
        <div
          style={{ color: "#8b9bab", fontSize: 22 }}
        >{`${n} recorded wallets · every clue is a Nansen field · ${SITE.replace(/^https?:\/\//, "")}/r/${seed}`}</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } },
  );
}
