//! Runs a complete Herald demo on a private local NEAR chain.
//!
//! `cargo run --example demo` starts a sandbox, deploys Herald and the Sputnik DAO build that
//! NEAR DevHub's Trezu treasury runs on mainnet, and plays out a believable ambassador program:
//! campaigns launched by DAO votes, creators at every trust level, paid work, a veto, and live
//! items left open for whoever opens the app. It writes `web/public/local-demo.json` for the web
//! app and keeps the chain running until you press Ctrl+C.
//!
//! All names are fictional. Keys are throwaway sandbox keys and never leave your machine.

use std::path::PathBuf;

use base64::Engine;
use near_workspaces::network::Sandbox;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const SPUTNIK: &[u8] = include_bytes!("../tests/res/sputnikdao2-mainnet.wasm");
const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn near(n: f64) -> String {
    ((n * 1000.0) as u128 * (NEAR / 1000)).to_string()
}

fn b64(value: &Value) -> String {
    base64::engine::general_purpose::STANDARD.encode(value.to_string())
}

struct Persona {
    account: Account,
    name: &'static str,
    role: &'static str,
}

struct Demo {
    worker: Worker<Sandbox>,
    herald: Contract,
    dao: Contract,
    council: Vec<Account>,
}

impl Demo {
    async fn propose(
        &self,
        proposer: &Account,
        description: &str,
        kind: &Value,
    ) -> anyhow::Result<u64> {
        let policy: Value = self.dao.view("get_policy").await?.json()?;
        let bond: u128 = policy["proposal_bond"].as_str().unwrap().parse()?;
        Ok(proposer
            .call(self.dao.id(), "add_proposal")
            .args_json(json!({ "proposal": { "description": description, "kind": kind } }))
            .deposit(NearToken::from_yoctonear(bond))
            .max_gas()
            .transact()
            .await?
            .json()?)
    }

    async fn vote(&self, member: &Account, id: u64, kind: &Value) -> anyhow::Result<()> {
        member
            .call(self.dao.id(), "act_proposal")
            .args_json(json!({ "id": id, "action": "VoteApprove", "proposal": kind }))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    /// Files a proposal and has a majority of the council approve it.
    async fn pass(&self, description: &str, kind: &Value) -> anyhow::Result<u64> {
        let id = self.propose(&self.council[0], description, kind).await?;
        // Sputnik passes a proposal once more than half the council approves; a later vote would fail.
        for member in self.council.iter().take(self.council.len() / 2 + 1) {
            self.vote(member, id, kind).await?;
        }
        Ok(id)
    }

    fn call_kind(&self, method: &str, args: Value, deposit: String, tgas: u64) -> Value {
        json!({ "FunctionCall": {
            "receiver_id": self.herald.id(),
            "actions": [{
                "method_name": method,
                "args": b64(&args),
                "deposit": deposit,
                "gas": (tgas * 1_000_000_000_000).to_string(),
            }],
        }})
    }

    async fn launch(&self, description: &str, args: Value, budget: f64) -> anyhow::Result<()> {
        let kind = self.call_kind("create_campaign", args, near(budget), 150);
        self.pass(description, &kind).await?;
        Ok(())
    }

    async fn submit(
        &self,
        creator: &Account,
        campaign: u64,
        line: Option<u32>,
        custom: Option<f64>,
        proof: &str,
        note: &str,
    ) -> anyhow::Result<u64> {
        Ok(creator
            .call(self.herald.id(), "submit")
            .args_json(json!({
                "campaign_id": campaign,
                "deliverable_index": line,
                "custom_amount": custom.map(near),
                "proof_url": proof,
                "note": note,
            }))
            .deposit(NearToken::from_millinear(50))
            .max_gas()
            .transact()
            .await?
            .json()?)
    }

    async fn act(&self, who: &Account, method: &str, args: Value) -> anyhow::Result<()> {
        who.call(self.herald.id(), method)
            .args_json(args)
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        Ok(())
    }

    async fn approve(&self, reviewer: &Account, id: u64) -> anyhow::Result<()> {
        self.act(reviewer, "approve", json!({ "submission_id": id }))
            .await
    }

    /// Gets a submission paid by whichever route it landed on: a reviewer approves pending work,
    /// and automatic payouts are finalized once their challenge window has passed.
    async fn pay(&self, reviewer: &Account, id: u64) -> anyhow::Result<()> {
        let sub: Value = self
            .herald
            .view("get_submission")
            .args_json(json!({ "submission_id": id }))
            .await?
            .json()?;
        match sub["status"].as_str().unwrap_or_default() {
            "Pending" => self.approve(reviewer, id).await,
            "Challenge" => {
                self.wait_out_challenge(id).await?;
                self.act(reviewer, "finalize", json!({ "submission_id": id }))
                    .await
            }
            other => anyhow::bail!("submission {id} is {other}, not payable"),
        }
    }

    async fn wait_out_challenge(&self, id: u64) -> anyhow::Result<()> {
        let sub: Value = self
            .herald
            .view("get_submission")
            .args_json(json!({ "submission_id": id }))
            .await?
            .json()?;
        let ends_ms = sub["challenge_ends_at_ms"].as_u64().unwrap();
        while self.worker.view_block().await?.timestamp() / 1_000_000 <= ends_ms {
            self.worker.fast_forward(200).await?;
        }
        Ok(())
    }
}

fn rules(
    trusted: u32,
    core: u32,
    auto_trusted: f64,
    auto_core: f64,
    reviewer: f64,
    challenge_sec: u32,
) -> Value {
    json!({
        "trusted_after": trusted,
        "core_after": core,
        "auto_limit_trusted": near(auto_trusted),
        "auto_limit_core": near(auto_core),
        "reviewer_limit": near(reviewer),
        "challenge_period_sec": challenge_sec,
        "max_open_per_creator": 3,
        "slash_points": 3,
    })
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("Starting a private NEAR chain...");
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let make = |name: &'static str, balance: u128| {
        let root = root.clone();
        async move {
            root.create_subaccount(name)
                .initial_balance(NearToken::from_near(balance))
                .transact()
                .await?
                .into_result()
                .map_err(anyhow::Error::from)
        }
    };

    println!("Deploying Herald and a Sputnik DAO...");
    let wasm = near_workspaces::compile_project(env!("CARGO_MANIFEST_DIR")).await?;
    let herald = make("herald", 40)
        .await?
        .deploy(&wasm)
        .await?
        .into_result()?;
    herald.call("new").transact().await?.into_result()?;

    let ade = make("ade", 50).await?;
    let oliver = make("oliver", 50).await?;
    let amelia = make("amelia", 50).await?;
    let dao = make("beacon", 600)
        .await?
        .deploy(SPUTNIK)
        .await?
        .into_result()?;
    dao.call("new")
        .args_json(json!({
            "config": { "name": "beacon", "purpose": "Beacon Collective ambassador treasury", "metadata": "" },
            "policy": [ade.id(), oliver.id(), amelia.id()],
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let kemi = make("kemi", 30).await?;
    let marco = make("marco", 30).await?;
    let cleo = make("cleo", 20).await?;
    let dami = make("dami", 20).await?;
    let femi = make("femi", 20).await?;
    let lina = make("lina", 20).await?;
    let sol = make("sol", 20).await?;

    let d = Demo {
        worker,
        herald,
        dao,
        council: vec![ade.clone(), oliver.clone(), amelia.clone()],
    };

    println!("Launching campaigns through DAO votes...");
    d.launch(
        "Launch the Q4 ambassador push: 150 NEAR for threads, videos, Spaces, translations and meetups",
        json!({
            "title": "Q4 ambassador push",
            "brief_url": "https://example.org/beacon/q4-ambassador-brief",
            "rate_card": [
                { "name": "X thread", "amount": near(2.0) },
                { "name": "Short video", "amount": near(6.0) },
                { "name": "Space co-host", "amount": near(4.0) },
                { "name": "Translation", "amount": near(3.0) },
                { "name": "Community meetup", "amount": near(12.0) },
            ],
            "reviewers": [kemi.id(), marco.id()],
            "rules": rules(2, 5, 4.0, 8.0, 15.0, 180),
        }),
        150.0,
    )
    .await?;
    d.launch(
        "Launch the creator video sprint: 60 NEAR for short and long-form videos",
        json!({
            "title": "Creator video sprint",
            "brief_url": "https://example.org/beacon/video-sprint-brief",
            "rate_card": [
                { "name": "Short video", "amount": near(8.0) },
                { "name": "Long-form video", "amount": near(20.0) },
            ],
            "reviewers": [marco.id()],
            "rules": rules(2, 5, 8.0, 12.0, 25.0, 180),
        }),
        60.0,
    )
    .await?;
    d.launch(
        "Launch week bounty: 20 NEAR for launch-day threads",
        json!({
            "title": "Launch week threads",
            "brief_url": "https://example.org/beacon/launch-week",
            "rate_card": [{ "name": "Launch-day thread", "amount": near(2.5) }],
            "reviewers": [kemi.id()],
            "rules": rules(2, 5, 2.5, 2.5, 10.0, 180),
        }),
        20.0,
    )
    .await?;

    println!("Playing out the program...");
    let x = "https://x.com";
    // Femi has a long record with Beacon: five paid deliverables makes Core.
    for (line, reviewer, post) in [
        (0, &kemi, "1"),
        (1, &marco, "2"),
        (2, &kemi, "3"),
        (0, &marco, "4"),
        (3, &kemi, "5"),
    ] {
        let id = d
            .submit(
                &femi,
                0,
                Some(line),
                None,
                &format!("{x}/femi_creates/status/{post}"),
                "",
            )
            .await?;
        d.pay(reviewer, id).await?;
    }
    // Cleo earns Trusted with two reviewed payouts, then gets her first automatic payout.
    for (line, post) in [(0, "11"), (3, "12")] {
        let id = d
            .submit(
                &cleo,
                0,
                Some(line),
                None,
                &format!("{x}/cleo_onchain/status/{post}"),
                "",
            )
            .await?;
        d.pay(&kemi, id).await?;
    }
    let auto = d
        .submit(
            &cleo,
            0,
            Some(0),
            None,
            &format!("{x}/cleo_onchain/status/13"),
            "Thread on how Beacon routes payouts",
        )
        .await?;
    d.wait_out_challenge(auto).await?;
    d.act(&oliver, "finalize", json!({ "submission_id": auto }))
        .await?;
    // Lina reaches Trusted, then a deleted thread gets vetoed inside its window.
    for post in ["21", "22"] {
        let id = d
            .submit(
                &lina,
                0,
                Some(0),
                None,
                &format!("{x}/lina_builds/status/{post}"),
                "",
            )
            .await?;
        d.pay(&marco, id).await?;
    }
    let vetoed = d
        .submit(
            &lina,
            0,
            Some(0),
            None,
            &format!("{x}/lina_builds/status/23"),
            "",
        )
        .await?;
    d.act(&marco, "veto", json!({ "submission_id": vetoed, "reason": "Thread was deleted an hour after posting", "fraud": false })).await?;
    // Dami is new: one off-brief post rejected.
    let rejected = d
        .submit(
            &dami,
            0,
            Some(0),
            None,
            &format!("{x}/dami_ng/status/31"),
            "",
        )
        .await?;
    d.act(&kemi, "reject", json!({ "submission_id": rejected, "reason": "Off-brief: the thread never mentions Beacon" })).await?;
    // Video sprint: one paid video.
    let video = d
        .submit(
            &femi,
            1,
            Some(0),
            None,
            "https://youtube.com/shorts/beacon-demo",
            "60-second walkthrough",
        )
        .await?;
    d.pay(&marco, video).await?;
    // Launch week: two paid threads, then the DAO closes it and takes back the rest.
    for (creator, post) in [(&cleo, "41"), (&femi, "42")] {
        let id = d
            .submit(
                creator,
                2,
                Some(0),
                None,
                &format!("{x}/launch/status/{post}"),
                "",
            )
            .await?;
        d.pay(&kemi, id).await?;
    }
    let close = d.call_kind(
        "close_campaign",
        json!({ "campaign_id": 2 }),
        "0".into(),
        50,
    );
    d.pass("Close launch week and return the unspent budget", &close)
        .await?;

    println!("Leaving live items open for you...");
    // Waiting for a reviewer: Dami's second try.
    d.submit(
        &dami,
        0,
        Some(0),
        None,
        &format!("{x}/dami_ng/status/32"),
        "Thread on Beacon's payout routes",
    )
    .await?;
    // Waiting for a reviewer: Core creator above the automatic limit.
    d.submit(
        &femi,
        0,
        Some(4),
        None,
        "https://lu.ma/beacon-lagos-meetup",
        "Lagos meetup, 40 attendees",
    )
    .await?;
    // A large custom request (above the reviewer limit) with a DAO vote one ballot from passing.
    let large = d
        .submit(
            &sol,
            0,
            None,
            Some(25.0),
            "https://example.org/sol/beacon-launch-video",
            "Launch video for the Q4 push",
        )
        .await?;
    let proposal: Value = d
        .herald
        .view("get_dao_proposal")
        .args_json(json!({ "submission_id": large }))
        .await?
        .json()?;
    let pid = d
        .propose(
            &ade,
            proposal["description"].as_str().unwrap(),
            &proposal["kind"],
        )
        .await?;
    d.vote(&ade, pid, &proposal["kind"]).await?;
    // Live challenge windows: automatic payouts that can still be vetoed.
    d.submit(
        &cleo,
        0,
        Some(0),
        None,
        &format!("{x}/cleo_onchain/status/14"),
        "Thread on Beacon's Q4 roadmap",
    )
    .await?;
    d.submit(
        &femi,
        0,
        Some(2),
        None,
        "https://x.com/i/spaces/beacon-q4",
        "Co-hosted the Q4 community Space",
    )
    .await?;

    let personas = vec![
        Persona {
            account: ade,
            name: "Ade",
            role: "council",
        },
        Persona {
            account: oliver,
            name: "Oliver",
            role: "council",
        },
        Persona {
            account: amelia,
            name: "Amelia",
            role: "council",
        },
        Persona {
            account: kemi,
            name: "Kemi",
            role: "reviewer",
        },
        Persona {
            account: marco,
            name: "Marco",
            role: "reviewer",
        },
        Persona {
            account: cleo,
            name: "Cleo",
            role: "creator",
        },
        Persona {
            account: femi,
            name: "Femi",
            role: "creator",
        },
        Persona {
            account: dami,
            name: "Dami",
            role: "creator",
        },
        Persona {
            account: lina,
            name: "Lina",
            role: "creator",
        },
        Persona {
            account: sol,
            name: "Sol",
            role: "creator",
        },
    ];
    let config = json!({
        "network": "local",
        "rpcUrl": d.worker.rpc_addr(),
        "herald": d.herald.id(),
        "dao": d.dao.id(),
        "daoName": "Beacon Collective",
        "personas": personas.iter().map(|p| json!({
            "accountId": p.account.id(),
            "name": p.name,
            "role": p.role,
            "secretKey": p.account.secret_key().to_string(),
        })).collect::<Vec<_>>(),
    });
    let out: PathBuf = [
        env!("CARGO_MANIFEST_DIR"),
        "..",
        "web",
        "public",
        "local-demo.json",
    ]
    .iter()
    .collect();
    std::fs::create_dir_all(out.parent().unwrap())?;
    std::fs::write(&out, serde_json::to_string_pretty(&config)?)?;

    let stats: Value = d.herald.view("get_stats").await?.json()?;
    println!(
        "\nHerald is running on a private chain at {}",
        d.worker.rpc_addr()
    );
    println!("Seeded: {stats}");
    println!("Wrote {}", out.display());
    println!("\nIn another terminal:  cd web && npm install && npm run dev");
    println!("Press Ctrl+C to stop the chain.");
    tokio::signal::ctrl_c().await?;
    Ok(())
}
