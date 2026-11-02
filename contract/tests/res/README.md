# Sputnik DAO builds used by the integration tests

Both files were downloaded from live NEAR accounts with the RPC `view_code` query, so the tests run against the exact code real treasuries use.

| File | Source account | Network | On-chain code hash |
|---|---|---|---|
| `sputnikdao2-mainnet.wasm` | `treasury-team.sputnik-dao.near` (NEAR DevHub's Trezu treasury) | mainnet | `4zSoHkLjJWZm34Psd4Eq2WUXHELt6LxtKmUXpsZWAECp` |
| `sputnikdao2-testnet.wasm` | `zf-chat-room.sputnik-v2.testnet` (deployed by the `sputnik-v2.testnet` factory) | testnet | `ZGdM2TFdQpcXrxPxvq25514EViyi9xBSboetDiB3Uiq` |

Sputnik DAO is MIT licensed: https://github.com/near-daos/sputnik-dao-contract (Copyright (c) 2021 near-daos).

To refresh a file, run `scripts/fetch-sputnik.sh`.
