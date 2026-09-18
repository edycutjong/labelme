# Bench — the live draw (`npm run bench -- --runs 10`)

Measured 2026-09-18T10:37:33.468Z on the shared `meridian` key from a laptop in Jakarta (Nansen latency swings by the minute — re-run before quoting).
Each run draws ONE unseen labelled wallet live (one sourcing page + the four clue calls), then replays the same draw from the in-memory cache.
None of the drawn wallets is in the committed deck, so the house reader's score here is out-of-sample.

| | cold p50 | cold p95 | warm p50 | warm p95 | credits / draw | calls / draw | failed draws | house reader |
|---|---|---|---|---|---|---|---|---|
| 10 draws | **2.1 s** | 2.6 s | 1 ms | 1 ms | **12.2** | 5.0 | 0 / 10 | 7 / 10 |

Per draw:

| # | class | cold | warm | credits | calls | wallet | house read |
|---|---|---|---|---|---|---|---|
| 1 | smart-money | 1.4 s | 1 ms | 13 | 5 | `0x3b558ff4…` | regular |
| 2 | exchange | 1.7 s | 1 ms | 13 | 5 | `0x18e22645…` | ✓ |
| 3 | whale | 2.4 s | 1 ms | 13 | 5 | `0xea98b473…` | regular |
| 4 | contract | 2.6 s | 1 ms | 13 | 5 | `0xf063806d…` | whale |
| 5 | regular | 2.5 s | 1 ms | 9 | 5 | `0x817b1019…` | ✓ |
| 6 | smart-money | 1.6 s | 1 ms | 13 | 5 | `0xadaf39c0…` | ✓ |
| 7 | exchange | 2.5 s | 1 ms | 13 | 5 | `0xa74e8ae2…` | ✓ |
| 8 | whale | 2.1 s | 1 ms | 13 | 5 | `0x5a8e77bc…` | ✓ |
| 9 | contract | 1.8 s | 1 ms | 13 | 5 | `0x52c77b0c…` | ✓ |
| 10 | regular | 1.8 s | 0 ms | 9 | 5 | `0x6fc1127f…` | ✓ |

The default round (`npm run labelme -- play`) makes **0 calls and costs 0 credits** — it deals from `fixtures/cards/` (62 cards); `npm run verify` replays all of them offline.
Cold = the first draw on a fresh cache; warm = the identical draw served from the cache (every row recorded at 0 credits, hash identical).
