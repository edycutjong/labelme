import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://labelme.edycu.dev"),
  title: "Label Me — guess the Nansen label",
  description: "Ten real ethereum wallets, four Nansen clues each. Guess Smart Money, exchange, whale, contract or regular — the reveal is Nansen's own label.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Label Me",
    title: "Label Me",
    description: "Ten real wallets. Guess the Nansen label.",
    images: [{ url: "/api/og?seed=meridian", width: 1200, height: 630, alt: "Label Me share card: Can you read a wallet? Ten real wallets, guess the Nansen label" }],
  },
  twitter: { card: "summary_large_image", creator: "@edycutjong", title: "Label Me", description: "Ten real wallets. Guess the Nansen label." },
  authors: [{ name: "Edy Cu Tjong", url: "https://github.com/edycutjong" }],
  creator: "Edy Cu Tjong",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0a0e13", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
