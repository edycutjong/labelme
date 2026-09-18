# RULES — how Label Me decides (from the shipped code, 2026-09-18)

Three rules run the game. None of them is an opinion: the **answer key** is which Nansen label group returned the row, the **tell** is a sentence template over the card's numbers, and the **house rule** is a page of thresholds a player can beat.

## 1 · The answer key — `packages/core/src/sources.ts`, `classes.ts`

An address earns one class from the sourcing lists it appears in, by precedence:

| Precedence | Class | Nansen says so via | Credits |
|---|---|---|---|
| 0 | **exchange** or **contract** by *entity label* | `profiler/address/transactions` (1) + `transaction-with-token-transfer-lookup` (1): when the label on the wallet's own side of a transfer carries 🏦 it is an exchange (`🤖 🏦 Luno: Wallet`), when it names a pool it is a contract (`🤖 🏦 Uniswap: V2 PEPE-WETH Liquidity Pool`). Optional; looked up for exchange/contract candidates in `seed` only | 2 |
| 1 | **contract** | a structural free-tier tag on `tgm/holders` (`Liquidity Pool`, `UniswapV2`, `Proxy`, `MultiSig`, `Token Contract`, `<X> Token Deployer`, …) — outranks membership in Nansen's Exchange group, because Nansen files DEX pools under Exchange | 5 |
| 2 | **exchange** | the row came from `tgm/holders label_type: "exchange"` + `include_smart_money_labels: ["Exchange"]` | 5 |
| 3 | **smart-money** | the row came from `tgm/holders label_type: "smart_money"` + `include_smart_money_labels: [Fund, 30D/90D/180D Smart Trader, Smart Trader]` or from `smart-money/dex-trades` (traders are Smart Money by construction) | 5 |
| 4 | **whale** | a wealth free-tier tag (`Token Billionaire`, `Token Millionaire`, `ETH Millionaire`, `<X> Whale`, `High Balance`) on a `tgm/holders` page — for the deck the plain page, for the live draw the page with all 17 label groups excluded | 5 |
| 5 | **regular** | the row came from `tgm/who-bought-sold` with `exclude_smart_money_labels` = every `LabelType` value (17), and its tag is neutral (empty, an ENS name, `High Activity`) | 1 |

Dropped, never dealt (`fixtures/dropped.json`): members of Nansen's **Public Figure** group (a person label, not a behaviour — the spike showed the class is unreadable from clues); addresses in **both** the Exchange and Smart Money groups; **dormant Smart Money** (< 5 trades in the 30-day window — unreadable, and a game must be winnable); a "regular" candidate that also appears in any label list.

Free-tier `address_label` is shown on the reveal **as returned**. It is never an entity name (`Binance 14` returns `Token Billionaire`); the entity name comes only from the 1-credit tx-lookup and only where one was found (23 of 62 cards).

## 2 · The clues — `clues.ts` (4 calls · 8 credits · 30-day window ending at the card's `now`)

| Clue | Endpoint | Fields → numbers |
|---|---|---|
| PnL | `profiler/address/pnl-summary` | `realized_pnl_usd` (rounded to $1), `realized_pnl_percent`, `win_rate` (3 dp; **null when `traded_times` = 0** — Nansen reports 0, which reads as "lost everything"), `traded_times`, `traded_token_count`, `top5_tokens[].token_symbol/realized_roi` |
| Trades | `profiler/address/pnl` (`show_realized`, top 5 by `pnl_usd_realised`) | `token_symbol`, `pnl_usd_realised`, `nof_buys`, `nof_sells` |
| Balance | `profiler/address/current-balance` (100 per page, by `value_usd`) | tokens held (`100+` when `is_last_page` is false), total USD, biggest position's share and symbol, stablecoin share |
| Counterparties | `profiler/address/counterparties` (`group_by: wallet`, 50 per page, by `total_volume_usd`) | count (`50+` when capped), Σ `interaction_count`, top counterparty's share of `volume_out_usd`, and the **class mix** — each counterparty's `counterparty_address_label[]` bucketed into pool · entity · contract · wealth · activity · ens · other · unlabelled, weighted by `total_volume_usd` |

The card hash — `sha256` of `{address, chain, class, nansenLabel, entity, clues, tell}` — pins exactly what the player sees and the answer. Cost, timing and the house rule are outside it, so a replay hashes identically and the reader can be re-tuned without touching the deck.

## 3 · The tell — `tell.ts`

One template per class, filled from the clues (excerpts):

- **exchange** — `100+ tokens worth $9.4B · 21 counterparties in 30 d, 100% of that volume with wealth-tagged or exchange wallets · 0 DEX trades — money moves in and out, nobody is trading: an exchange wallet`
- **whale** — `PEPE is 100% of a $30M balance · 0 trades · 1 counterparty in 30 d — a big holder sitting still: a whale`
- **smart-money** — `472 trades in 30 d · win rate 67% · realised $12K across 6 tokens · 97% of flow through DEX pools and routers — a trader Nansen tracks as Smart Money` (dormant variant: `… Nansen tracks this wallet as Smart Money for its record; this month it sat still`)
- **contract** — pools: `37,652 interactions from 50+ counterparties in 30 d · 19 tokens split 50% / 50% · no trades of its own — traffic without a trader: a liquidity pool`; signers: `… — code with signers, not a person: a MultiSig`
- **regular** — `13 trades · 2 tokens worth $35K · 6 counterparties in 30 d — none of Nansen's label groups: a regular wallet`

## 4 · The house rule — `reader.ts` (`npm run reader`)

A deterministic reader over the same four clues. Its thresholds were set by looking at the 62-card deck (in-sample); `npm run bench` reports it on fresh draws it never saw (7/10 on 2026-09-18). It is a bar for the player, not an oracle, and it is not in the card hash.

```
contract   interactions ≥ 2,000 (or 50+ counterparties with ≥ 20 interactions each)  AND tokens < 20
exchange   balance ≥ $10M AND trades ≤ 5 AND ((tokens ≥ 15 AND wealth-tagged/entity counterparties ≥ 50 %) OR tokens ≥ 50)
whale      balance ≥ $1M AND biggest position ≥ 80 % AND trades ≤ 10
smart-money trades ≥ 25 AND tokens traded ≥ 6        ← win rate and the sign of PnL do NOT separate Smart Money from a regular buyer on this deck
regular    everything else
```

Confusion matrix on the deck (rows = truth, columns = guess), 50/62 = 81 %:

| truth \ guess | smart-money | exchange | whale | contract | regular |
|---|---|---|---|---|---|
| smart-money | **10** | 0 | 0 | 0 | 2 |
| exchange | 0 | **14** | 1 | 0 | 1 |
| whale | 0 | 0 | **11** | 1 | 0 |
| contract | 1 | 0 | 0 | **3** | 6 |
| regular | 0 | 0 | 0 | 0 | **12** |

Where it fails, honestly: dormant proxies/multisigs (0 counterparties, a few tokens) read as regular; a Bybit wallet holding 8 tokens reads as a whale; a "Token Millionaire" with 5,019 trades reads as a contract. Those are the hard cards — a player who reads them right beats the house.

## 5 · The round — `round.ts`

`makeRound(deck, seed)`: cards sorted by id (file order never matters), classes shuffled by a sha256 stream keyed on the seed, round-robin two per class, then shuffled — ten cards, deterministic for the seed, pinned to `deckHash`. Seeds are squeezed to `[A-Za-z0-9_-]{1,32}` so they survive a URL; an empty seed becomes a random one.
