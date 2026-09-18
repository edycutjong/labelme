# Bench — the live draw (`npm run bench -- --runs 10`)

Measured 2026-09-18T10:22:45.058Z on the shared `meridian` key from a laptop in Jakarta (Nansen latency swings by the minute — re-run before quoting).
Each run draws ONE unseen labelled wallet live (one sourcing page + the four clue calls), then replays the same draw from the in-memory cache.
None of the drawn wallets is in the committed deck, so the house reader's score here is out-of-sample.

| | cold p50 | cold p95 | warm p50 | warm p95 | credits / draw | calls / draw | failed draws | house reader |
|---|---|---|---|---|---|---|---|---|
| 10 draws | **1.9 s** | 12.0 s | 3 ms | 10 ms | **13.2** | 5.2 | 1 / 10 | 7 / 9 |

Per draw:

| # | class | cold | warm | credits | calls | wallet | house read |
|---|---|---|---|---|---|---|---|
| 1 | smart-money | 1.8 s | 5 ms | 13 | 5 | `0x3b558ff4…` | regular |
| 2 | exchange | 2.2 s | 3 ms | 13 | 5 | `0x21a31ee1…` | ✓ |
| 3 | whale | 2.2 s | 3 ms | 13 | 5 | `0xea98b473…` | regular |
| 4 | contract | 3.2 s | 0 ms | 15 | 3 | ✗ no unseen contract wallet on the sourcing pages tried — try again | — |
| 5 | regular | 1.8 s | 1 ms | 9 | 5 | `0x817b1019…` | ✓ |
| 6 | smart-money | 2.7 s | 10 ms | 13 | 5 | `0xadaf39c0…` | ✓ |
| 7 | exchange | 1.8 s | 3 ms | 13 | 5 | `0xa74e8ae2…` | ✓ |
| 8 | whale | 1.9 s | 2 ms | 13 | 5 | `0xe0b66bfc…` | ✓ |
| 9 | contract | 12.0 s | 3 ms | 23 | 7 | `0xd3d2e269…` | ✓ |
| 10 | regular | 1.8 s | 4 ms | 9 | 5 | `0x6fc1127f…` | ✓ |

The default round (`npm run labelme -- play`) makes **0 calls and costs 0 credits** — it deals from `fixtures/cards/` (62 cards); `npm run verify` replays all of them offline.
Cold = the first draw on a fresh cache; warm = the identical draw served from the cache (every row recorded at 0 credits, hash identical).
