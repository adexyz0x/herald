# Herald

**Pay the people who carry your message.**

Herald runs ambassador and creator payouts from a DAO's treasury on NEAR. The DAO funds a campaign once with a rate card. After that, every payout takes the cheapest route the creator has earned:

| Route | Who decides | When |
| --- | --- | --- |
| Automatic | The clock | Trusted and Core creators, rate-card work within their limit. Paid after a short public window in which any reviewer can veto. |
| One reviewer | A reviewer the DAO appointed | Newcomers, custom amounts, anything above a creator's automatic limit. |
| DAO vote | The council | Anything above the reviewer limit, or anything a reviewer sends up. Herald writes the Sputnik proposal; the DAO votes and pays. |

Trust is earned one DAO at a time. Every paid deliverable adds a point with that DAO, enough points make a creator Trusted and then Core, and a veto takes points away. Trust earned in one community never unlocks automatic payouts in another.

Built for the [NEAR HACKATHON](https://nearhackathon.com), Social Money track. Works with any Sputnik DAO, including Trezu treasuries.

## Live on NEAR testnet

- **App:** https://herald-near.pages.dev (connect a [Meteor](https://wallet.meteorwallet.app) wallet switched to Testnet)
- **Contract:** [`herald.testnet`](https://testnet.nearblocks.io/address/herald.testnet)
- **Pilot DAO:** [`herald-dao.sputnik-v2.testnet`](https://testnet.nearblocks.io/address/herald-dao.sputnik-v2.testnet), created through NEAR's Sputnik factory. Its council is Ade, who leads the project, plus two operator accounts the Herald team runs for the pilot (`oliver-herald`, `amelia-herald`). A proposal passes with 2 of 3 votes.
- **Campaign:** "Herald launch week", launched by a DAO vote ([brief](https://herald-near.pages.dev/briefs/launch-week.html)).

**Demo test, disclosed.** The activity on testnet so far is a demo test run by the Herald team with three demo tester accounts: `aminx-demo`, `lamz-demo` and `zhod-demo`. Their profiles say so, and their proof links open [demo posts](https://herald-near.pages.dev/demo/posts) that are marked as demos. The first run exercised all three routes with real transactions:

- Lamz: a thread approved by a reviewer and paid on the spot.
- Aminx: two reviewed threads, which made Aminx Trusted, then a third thread that paid automatically after its public window.
- Zhod: a custom request a reviewer sent to the DAO; two council votes passed it and the DAO paid it.

Since then the same three accounts have been paid 16 times, 9.5 test NEAR in all: 7 approved by a reviewer, 5 automatic and 4 by DAO vote. Every step is public on chain.

## Try it locally in five minutes

You need Rust (via [rustup](https://rustup.rs); the toolchain version is pinned in `contract/rust-toolchain.toml`), [`cargo-near`](https://github.com/near/cargo-near) 0.22 and Node 22 or newer.

```bash
cd contract && cargo run --example demo
```

This starts a private NEAR chain, deploys Herald and a real Sputnik DAO v2 build, seeds a fictional DAO called Beacon Collective with three campaigns and a history of payouts, and writes `web/public/local-demo.json` for the app. Leave it running. In a second terminal:

```bash
cd web && npm install && npm run dev
```

Open http://localhost:5173 and use **Viewing as** in the header to act as anyone in the demo. Each person signs with their own key on the local chain.

| Do this | See this |
| --- | --- |
| As **Cleo** (creator), open *Q4 ambassador push* and submit an X thread | The form says it will pay automatically; the row shows "Pays in 03:00" |
| As **Marco** (reviewer), open the Review queue and veto that thread | Cleo loses 3 points, visible on her profile's points ledger |
| As **Kemi** (reviewer), approve Dami's pending thread | Dami is paid at once and the payout is stamped with the reviewer seal |
| As **Oliver** (council), open Council and approve Sol's 25 NEAR request | The DAO executes the proposal and pays Sol; it moves to Decided |
| As **Amelia** (council), click Start a proposal, then Fill an example, then File the proposal; vote yes as Amelia and Ade | The new campaign goes live with its budget |

The home page also tells the whole flow as a scroll story: one creator's path through the three routes.

## Tests

```bash
cd contract && cargo test
```

- 26 unit tests for routing, tiers, budgets, storage accounting, vetoes, bans and payout rollbacks.
- 2 integration tests that run the whole program in a sandbox against the real Sputnik DAO v2 builds deployed on mainnet and testnet (`contract/tests/res`): launch by DAO vote, reviewer payouts, earning Trusted, an automatic payout with its challenge window, a veto, a DAO-vote payout, closing a campaign and refunding the treasury.

```bash
cd web && npm run typecheck && npm run build
```

## How it fits together

```
DAO treasury ── council vote ──▶ campaign budget (held by Herald) ──▶ creator's wallet
      ▲                                    │
      └────────── unspent budget on close ─┘
```

- **The DAO only ever moves a capped budget.** `create_campaign` is called by the DAO through a Sputnik `FunctionCall` proposal, with the budget attached. Top-ups and closing work the same way.
- **Payouts go straight to the creator.** Herald transfers from the campaign budget to the creator's account. A failed transfer rolls back to "payout to retry" and anyone can retry it.
- **Invariant:** reserved + paid ≤ budget for every campaign. Automatic payouts reserve their amount for the length of their public window.
- **Herald takes no fee.**
- **The contract has no admin methods.** Only a campaign's DAO can change it, and only through its own votes. On testnet the deployer account still holds its key so fixes can ship during the hackathon; for mainnet the plan is to remove that key or hand upgrades to a DAO.

The full specification, including the lifecycle, parameters and threat model, is in [docs/DESIGN.md](docs/DESIGN.md).

### Contract interface

| Who | Methods |
| --- | --- |
| A campaign's DAO | `create_campaign`, `top_up`, `update_campaign`, `close_campaign`, `dao_approve`, `dao_reject`, `dao_set_ban` |
| Creators | `submit` (rate-card line or custom amount, with a proof link) |
| Reviewers | `approve`, `reject`, `veto` (optionally as fraud, which bans), `escalate` |
| Anyone | `finalize` (after the public window), `claim` (retry a failed transfer) |
| Views | `get_campaign(s)`, `get_submission`, `get_campaign_submissions`, `get_creator_submissions`, `get_reputation`, `get_tier`, `get_dao_proposal`, `get_stats` |

Every state change emits a NEP-297 event (`standard: "herald"`).

## Repository

| Path | What's there |
| --- | --- |
| `contract/` | Rust smart contract (near-sdk 5.30): campaigns, submissions, payouts, views, validation |
| `contract/tests/` | Sandbox integration tests against real Sputnik builds |
| `contract/examples/demo.rs` | The local demo: chain, contracts and seeded program |
| `web/` | React 19, Tailwind CSS 4 and Motion app; local demo and testnet builds |
| `scripts/testnet.sh` | Testnet operations: deploy, create and fund the DAO, propose campaigns, vote, review |
| `scripts/publish-testnet.sh` | Builds the testnet app and publishes it, refusing to ship if a key slips in |
| `pilot/` | The launch week campaign definition |
| `docs/DESIGN.md` | Design and specification |

## Next

- Stablecoin budgets (USDC via NEP-141).
- Gasless submissions and claims for creators through a meta-transaction relayer.
- An AI pre-check on NEAR AI Cloud that reads the submitted post and gives reviewers a second opinion.
- Reputation export, so other programs can read a creator's verified history.
- Mainnet, starting with DAOs that already pay ambassadors from a Sputnik or Trezu treasury.

## Built by

[Ade](https://x.com/adefola_), a former Arbitrum ambassador who works on user acquisition at Immutable and runs creator campaigns.

## License

MIT, see [LICENSE](LICENSE). The Sputnik DAO wasm files used in tests are MIT licensed by their authors; see `contract/tests/res/README.md`.
