/** The canonical public URL (DNS live 2026-09-19). `https://labelme-edycutjong.vercel.app` stays as the fallback alias. */
// `||`, not `??`: an empty SITE_URL (a blank line in .env, an env pulled as "") must not make `new URL("")` throw at build time.
export const SITE = process.env.SITE_URL || "https://labelme.edycu.dev";
export const REPO = "https://github.com/edycutjong/labelme";
