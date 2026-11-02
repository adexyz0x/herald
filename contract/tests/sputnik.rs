//! End-to-end tests on a local NEAR sandbox, against real Sputnik DAO builds.
//!
//! The DAO launches a campaign by voting on a proposal, creators are paid through every
//! approval route, and a large payout is approved by a DAO vote on the exact proposal that
//! Herald generates. The same program runs against two Sputnik builds: the one NEAR DevHub's
//! Trezu treasury runs on mainnet, and the one the testnet factory deploys (see tests/res).

use base64::Engine;
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const SPUTNIK_MAINNET: &[u8] = include_bytes!("res/sputnikdao2-mainnet.wasm");
const SPUTNIK_TESTNET: &[u8] = include_bytes!("res/sputnikdao2-testnet.wasm");
const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn near(n: u128) -> String {
    (n * NEAR).to_string()
}

fn b64(value: &Value) -> String {
    base64::engine::general_purpose::STANDARD.encode(value.to_string())
}

/// Checks a balance change against an expected payout. Gas refunds from the account's own
/// earlier transactions can land in the same window, so up to 0.001 NEAR extra is allowed.
fn assert_received(before: u128, after: u128, expected: u128) {
    let delta = after - before;
    assert!(
        delta >= expected && delta - expected < NEAR / 1000,
        "expected a payout of {expected} yoctoNEAR, balance moved by {delta}"
    );
}

struct World {
    worker: Worker<Sandbox>,
    dao: Contract,
    app: Contract,
    council: Vec<Account>,
    rita: Account,
    ralph: Account,
    cleo: Account,
    keeper: Account,
}

async fn account(root: &Account, name: &str, balance: u128) -> anyhow::Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(balance))
        .transact()
        .await?
        .into_result()?)
}

async fn setup(sputnik: &[u8]) -> anyhow::Result<World> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;

    let app_wasm = near_workspaces::compile_project("./").await?;
    let app = account(&root, "herald", 30).await?.deploy(&app_wasm).await?.into_result()?;
    app.call("new").transact().await?.into_result()?;

    let council = vec![account(&root, "ada", 30).await?, account(&root, "bayo", 30).await?];
    let dao = account(&root, "ambassadors", 300).await?.deploy(sputnik).await?.into_result()?;
    dao.call("new")
        .args_json(json!({
            "config": { "name": "ambassadors", "purpose": "Ambassador program treasury", "metadata": "" },
            "policy": [council[0].id(), council[1].id()],
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    Ok(World {
        rita: account(&root, "rita", 20).await?,
        ralph: account(&root, "ralph", 20).await?,
        cleo: account(&root, "cleo", 20).await?,
        keeper: account(&root, "keeper", 20).await?,
        worker,
        dao,
        app,
        council,
    })
}

impl World {
    /// Files a Sputnik proposal and has the whole council approve it. Returns its final status.
    async fn dao_vote(&self, description: &str, kind: &Value) -> anyhow::Result<String> {
        let policy: Value = self.dao.view("get_policy").await?.json()?;
        let bond: u128 = policy["proposal_bond"].as_str().unwrap().parse()?;
        let id: u64 = self.council[0]
            .call(self.dao.id(), "add_proposal")
            .args_json(json!({ "proposal": { "description": description, "kind": kind } }))
            .deposit(NearToken::from_yoctonear(bond))
            .max_gas()
            .transact()
            .await?
            .json()?;
        for member in &self.council {
            member
                .call(self.dao.id(), "act_proposal")
                .args_json(json!({ "id": id, "action": "VoteApprove", "proposal": kind }))
                .max_gas()
                .transact()
                .await?
                .into_result()?;
        }
        let proposal: Value = self
            .dao
            .view("get_proposal")
            .args_json(json!({ "id": id }))
            .await?
            .json()?;
        Ok(proposal["status"].as_str().unwrap().to_string())
    }

    async fn launch_campaign(&self) -> anyhow::Result<()> {
        let args = json!({
            "title": "Q4 ambassador push",
            "brief_url": "https://example.org/brief",
            "rate_card": [
                { "name": "X thread", "amount": near(5) },
                { "name": "Short video", "amount": near(15) },
            ],
            "reviewers": [self.rita.id(), self.ralph.id()],
            "rules": {
                "trusted_after": 2,
                "core_after": 4,
                "auto_limit_trusted": near(10),
                "auto_limit_core": near(20),
                "reviewer_limit": near(20),
                "challenge_period_sec": 60,
                "max_open_per_creator": 3,
                "slash_points": 3,
            },
        });
        let kind = json!({ "FunctionCall": {
            "receiver_id": self.app.id(),
            "actions": [{
                "method_name": "create_campaign",
                "args": b64(&args),
                "deposit": near(100),
                "gas": "150000000000000",
            }],
        }});
        let status = self.dao_vote("Launch the Q4 ambassador campaign with 100 NEAR", &kind).await?;
        assert_eq!(status, "Approved", "the DAO proposal executed");
        Ok(())
    }

    async fn submit(&self, line: Option<u32>, custom_near: Option<u128>) -> anyhow::Result<u64> {
        Ok(self
            .cleo
            .call(self.app.id(), "submit")
            .args_json(json!({
                "campaign_id": 0,
                "deliverable_index": line,
                "custom_amount": custom_near.map(near),
                "proof_url": "https://x.com/cleo/status/1",
            }))
            .deposit(NearToken::from_millinear(100))
            .max_gas()
            .transact()
            .await?
            .json()?)
    }

    async fn submission(&self, id: u64) -> anyhow::Result<Value> {
        Ok(self
            .app
            .view("get_submission")
            .args_json(json!({ "submission_id": id }))
            .await?
            .json()?)
    }

    async fn status(&self, id: u64) -> anyhow::Result<String> {
        Ok(self.submission(id).await?["status"].as_str().unwrap().to_string())
    }

    async fn balance(&self, account: &Account) -> anyhow::Result<u128> {
        Ok(account.view_account().await?.balance.as_yoctonear())
    }

    async fn tier(&self) -> anyhow::Result<Value> {
        Ok(self
            .app
            .view("get_tier")
            .args_json(json!({ "campaign_id": 0, "account_id": self.cleo.id() }))
            .await?
            .json()?)
    }

    async fn review(&self, reviewer: &Account, method: &str, args: Value) -> anyhow::Result<ExecutionFinalResult> {
        Ok(reviewer.call(self.app.id(), method).args_json(args).max_gas().transact().await?)
    }

    /// Advances the sandbox clock past a submission's challenge window.
    async fn wait_out_challenge(&self, id: u64) -> anyhow::Result<()> {
        let ends_ms = self.submission(id).await?["challenge_ends_at_ms"].as_u64().unwrap();
        for _ in 0..20 {
            let now_ms = self.worker.view_block().await?.timestamp() / 1_000_000;
            if now_ms > ends_ms {
                return Ok(());
            }
            self.worker.fast_forward(100).await?;
        }
        anyhow::bail!("sandbox clock did not pass the challenge window")
    }
}

async fn full_program(sputnik: &[u8]) -> anyhow::Result<()> {
    let w = setup(sputnik).await?;

    // 1. The DAO launches and funds a campaign with one vote.
    w.launch_campaign().await?;
    let campaign: Value = w.app.view("get_campaign").args_json(json!({ "campaign_id": 0 })).await?.json()?;
    assert_eq!(campaign["dao"], w.dao.id().to_string());
    let budget: u128 = campaign["budget"].as_str().unwrap().parse()?;
    assert!(budget > 99 * NEAR && budget < 100 * NEAR, "budget is the deposit minus storage");

    // 2. A newcomer's work needs one reviewer, and is paid the moment it's approved.
    let first = w.submit(Some(0), None).await?;
    assert_eq!(w.status(first).await?, "Pending");
    let before = w.balance(&w.cleo).await?;
    let paid: bool = w.review(&w.rita, "approve", json!({ "submission_id": first })).await?.json()?;
    assert!(paid);
    assert_received(before, w.balance(&w.cleo).await?, 5 * NEAR);

    // 3. A second paid deliverable makes the creator Trusted with this DAO.
    let second = w.submit(Some(0), None).await?;
    w.review(&w.ralph, "approve", json!({ "submission_id": second })).await?.into_result()?;
    assert_eq!(w.tier().await?["tier"], "Trusted");

    // 4. Trusted work is approved automatically, but only after a public challenge window.
    let auto = w.submit(Some(0), None).await?;
    assert_eq!(w.status(auto).await?, "Challenge");
    let early = w.keeper.call(w.app.id(), "finalize").args_json(json!({ "submission_id": auto })).max_gas().transact().await?;
    assert!(early.is_failure(), "finalizing inside the window is refused");
    w.wait_out_challenge(auto).await?;
    let before = w.balance(&w.cleo).await?;
    let paid: bool = w.keeper.call(w.app.id(), "finalize").args_json(json!({ "submission_id": auto })).max_gas().transact().await?.json()?;
    assert!(paid);
    assert_received(before, w.balance(&w.cleo).await?, 5 * NEAR);
    assert_eq!(w.tier().await?["points"], 3);

    // 5. A reviewer can veto an automatic payout inside its window, which costs reputation.
    let vetoed = w.submit(Some(0), None).await?;
    w.review(&w.ralph, "veto", json!({ "submission_id": vetoed, "reason": "Thread was deleted", "fraud": false }))
        .await?
        .into_result()?;
    assert_eq!(w.status(vetoed).await?, "Vetoed");
    assert_eq!(w.tier().await?["points"], 0, "3 points minus the 3-point slash");

    // 6. A large request is paid only after a DAO vote on the proposal Herald generates.
    let large = w.submit(None, Some(18)).await?;
    w.review(&w.rita, "escalate", json!({ "submission_id": large })).await?.into_result()?;
    assert_eq!(w.status(large).await?, "AwaitingDao");
    let not_dao = w.review(&w.rita, "dao_approve", json!({ "submission_id": large })).await?;
    assert!(not_dao.is_failure(), "a reviewer can't use the DAO's route");
    let proposal: Value = w.app.view("get_dao_proposal").args_json(json!({ "submission_id": large })).await?.json()?;
    let before = w.balance(&w.cleo).await?;
    let status = w.dao_vote(proposal["description"].as_str().unwrap(), &proposal["kind"]).await?;
    assert_eq!(status, "Approved");
    assert_eq!(w.status(large).await?, "Paid");
    assert_received(before, w.balance(&w.cleo).await?, 18 * NEAR);

    // 7. Closing the campaign returns every unreserved NEAR to the treasury.
    let campaign: Value = w.app.view("get_campaign").args_json(json!({ "campaign_id": 0 })).await?.json()?;
    let refund: u128 = campaign["available"].as_str().unwrap().parse()?;
    let before = w.balance(w.dao.as_account()).await?;
    let kind = json!({ "FunctionCall": {
        "receiver_id": w.app.id(),
        "actions": [{
            "method_name": "close_campaign",
            "args": b64(&json!({ "campaign_id": 0 })),
            "deposit": "0",
            "gas": "50000000000000",
        }],
    }});
    assert_eq!(w.dao_vote("Close the Q4 campaign", &kind).await?, "Approved");
    let campaign: Value = w.app.view("get_campaign").args_json(json!({ "campaign_id": 0 })).await?.json()?;
    assert_eq!(campaign["status"], "Closed");
    let gained = w.balance(w.dao.as_account()).await? as i128 - before as i128;
    assert!(
        (gained - refund as i128).abs() < NEAR as i128 / 10,
        "DAO got its unspent budget back (gained {gained}, refund {refund})"
    );

    let stats: Value = w.app.view("get_stats").await?.json()?;
    assert_eq!(stats["payouts"], 4);
    assert_eq!(stats["total_paid"], near(5 + 5 + 5 + 18));
    Ok(())
}

#[tokio::test]
async fn ambassador_program_on_mainnet_sputnik_build() -> anyhow::Result<()> {
    full_program(SPUTNIK_MAINNET).await
}

#[tokio::test]
async fn ambassador_program_on_testnet_factory_sputnik_build() -> anyhow::Result<()> {
    full_program(SPUTNIK_TESTNET).await
}
