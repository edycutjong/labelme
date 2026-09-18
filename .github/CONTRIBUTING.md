# Contributing

Thanks for your interest in improving Label Me! 🎉

## Getting Started
1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install dependencies: `npm install` (npm workspaces: `packages/core`, `packages/cli`, `apps/web`)
3. Copy the env template: `cp .env.example .env` and paste your Nansen key (https://app.nansen.ai/api)
4. Try the CLI: `npm run labelme -- play --seed meridian1933 --answers` (0 credits) or `npm run labelme -- draw --explain` (≤ 13 credits) · web: `npm run dev` → http://localhost:3200

## Before You Open a PR
- `npm run ci` passes — audit, prettier, eslint, tsc, vitest with coverage, `verify` (the 62 recorded cards replay offline), `check` (README claims vs tree).
- `npm run e2e` passes (Playwright, runs the built app with **no** key — never add a test that spends credits).
- Add or update tests for any behavior change. Regression tests are **named after the defect they pin**
  (`"REGRESSION (audit 2026-09-19): clue rows are emitted as each call lands, not as one batch after the slowest"`), not `test_3`.
- Anything that changes the class rule, the clues or the tell must keep `packages/core/test/property.test.ts` green and
  `npm run verify` at 62/62 — if a card legitimately changes, rebuild it offline with `npm run verify -- --update` and say so in the PR.
- Keep commits conventional: `feat:` (minor), `fix:`/`perf:` (patch), `docs:`, `test:`, `ci:`, `chore:` (no release).
  `release.yml` tags and publishes from these prefixes automatically once the CI/CD pipeline is green on `main`
  (bumps every `package.json` + the lockfile, commits `chore(release): vX.Y.Z [skip ci]`, annotated tag, GitHub Release
  with generated notes). When Actions is unavailable, a maintainer runs the same algorithm locally:
  `npm run release -- --dry-run` to preview, `npm run release` to cut it (clean tree, on `main`, level with origin).

## Credits are the constraint
Every live Nansen call costs credits (table in `packages/core/src/client.ts`). Cached calls are free and labelled.
Never add a call to a 100-credit endpoint; never put `NANSEN_OFFLINE=1` into a reproduce command.

## Reporting Bugs / Requesting Features
Open an issue using the provided templates. Include the seed or the wallet address, the card hash from the reveal,
and the expected vs. actual card states.
