# DX report — building Label Me on the Nansen API (2026-09-18)

What was rough, what was surprising, and what we wish existed. Every item was hit for real (`specs/spike-raw.txt` in the kitchen has the raw responses); none is a guess.

## Frictions (9)

1. **`profiler/address/pnl` returns HTTP 400 without `date`** — the OpenAPI schema marks `date` optional (`anyOf`), the API says `Either 'from' or 'to' date must be provided`. Cost us one wasted call per wallet on the first spike run (17 × 1 credit).
2. **`tgm/holders label_type` needs a matching `include_smart_money_labels` filter or it silently returns the unfiltered top holders** — the description says so, but a wrong pairing is a 5-credit no-op with a 200, not a 422.
3. **Free-tier `address_label` never carries an entity name.** `Binance 14` comes back as `Token Billionaire`; `Robinhood` as `Token Millionaire`. The entity name for the same wallet is 1 credit away in `transaction-with-token-transfer-lookup`'s `*_address_label` (🏦 Binance) — but only by way of one of its transactions. A `labels_lite` (entity name only, 1–5 credits) would remove a two-call detour.
4. **Nansen files DEX pools under the Exchange label group.** `label_type: exchange` on PEPE returns the Uniswap V2 PEPE-WETH pool between Binance and Robinhood. A `dex` vs `cex` split in `LabelType` would make "exchange" mean what a newcomer thinks it means.
5. **`label_type: whale` returned 0 rows on PEPE** (and needs `include_smart_money_labels: ["Whale"]`) while the free tags `PEPE Whale` / `Token Billionaire` are on the same page — two notions of "whale", one paid, one free, with different membership.
6. **`win_rate` is `0` for a wallet with no sales in the window** — indistinguishable from a wallet that lost every trade. `null` would be honest.
7. **Zero-width characters inside labels**: `​​🏦 Robinhood [0x1d4896]`. Harmless in a terminal, ugly in a UI; we strip `​–‍`.
8. **The counterparties page for a hot wallet is fine over 30 days (≤ 4 s), but the docs warn of slowness "over wide ranges" without saying what wide is.** A `max_days` per endpoint in the schema would let a client pick a window without a spike.
9. **`premium_labels=true` on the free plan is a clean 403 `plan_upgrade_required`** (0 credits) — good — but the `x-nansen-notice` header advertising it arrives on every holders call, so a client that logs headers sees it hundreds of times.

## What worked well (4)

- **Credits in headers** (`x-nansen-credits-cost`, `-used`, `-remaining`) on every response — the client records the real cost instead of trusting a table; the bench and the provenance drawer are honest because of it.
- **Server-side label filters at the base price**: `label_type` + `include_smart_money_labels` on `tgm/holders`, and `exclude_smart_money_labels` on `who-bought-sold`, give label-group membership for 1–5 credits — the whole answer key of this game without a 100/150/500-credit label call.
- **`counterparty_address_label[]`** on `profiler/address/counterparties`: labels for the *other* side of every transfer make the strongest tell (an exchange's counterparties are 100 % wealth-tagged; a trader's are pools and routers).
- **Consistent error envelopes** (`code`, `doc_url`, `request_id`) — every failure we hit was explainable from the body.

## Wishes (5)

1. `label_type: dex_pool` (or `contract`) on `tgm/holders` — pools are ≈ 1 per top-100 page on meme coins; we source them from WETH's holders instead.
2. `entity_name` on `HolderRow` for the free tier when the entity is public (Binance, Uniswap) — the reveal could name the exchange without the tx-lookup detour.
3. A `labels_summary` per address at 1 credit: the label *groups* (Smart Money / Exchange / Fund / Public Figure / none) without the label strings — exactly what a game, a risk gate or a UI badge needs.
4. `date` required in the schema where the API requires it (`profiler/address/pnl`), or an explicit default window in the response.
5. Batch clue endpoints (`counterparties/batch` exists — `pnl-summary/batch` and `current-balance/batch` would cut a card from 4 calls to 2).
