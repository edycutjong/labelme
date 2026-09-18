import type { NextConfig } from "next";

const config: NextConfig = {
  htmlLimitedBots: /./,
  experimental: { inlineCss: true },
  // the engine is imported straight from packages/core/src (TypeScript) — one engine for CLI and web
  transpilePackages: ["@labelme/core"],
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
  // the deck IS the fixtures: every route that deals or reveals reads fixtures/cards/*.json from disk
  outputFileTracingIncludes: {
    "/": ["../../fixtures/**/*.json"],
    "/r/[seed]": ["../../fixtures/**/*.json"],
    "/api/round": ["../../fixtures/**/*.json"],
    "/api/reveal": ["../../fixtures/**/*.json"],
    "/api/draw": ["../../fixtures/**/*.json"],
    "/api/og": ["../../fixtures/**/*.json"],
    "/judge": ["../../fixtures/**/*.json"],
  },
  webpack: (cfg) => {
    cfg.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return cfg;
  },
  turbopack: { resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"] },
};
export default config;
