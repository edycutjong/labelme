/** The stable public URL. `labelme.edycu.dev` needs a DNS record (human step); until then the Vercel alias is the canonical one. */
// `||`, not `??`: an empty SITE_URL (a blank line in .env, an env pulled as "") must not make `new URL("")` throw at build time.
export const SITE = process.env.SITE_URL || "https://labelme-edycutjong.vercel.app";
export const REPO = "https://github.com/edycutjong/labelme";
