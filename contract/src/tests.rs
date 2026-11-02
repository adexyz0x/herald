//! Unit tests for the rules in docs/DESIGN.md. Integration tests against a real Sputnik DAO
//! live in tests/sputnik.rs.

use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult, RuntimeFeesConfig};

use crate::types::*;
use crate::Contract;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn acc(name: &str) -> AccountId {
    name.parse().unwrap()
}
fn contract_id() -> AccountId {
    acc("herald.near")
}
fn dao() -> AccountId {
    acc("ambassadors.sputnik-dao.near")
}
fn other_dao() -> AccountId {
    acc("other.sputnik-dao.near")
}
fn reviewer() -> AccountId {
    acc("rita.near")
}
fn reviewer2() -> AccountId {
    acc("ralph.near")
}
fn creator() -> AccountId {
    acc("cleo.near")
}

struct Env {
    now_ms: u64,
}

impl Env {
    fn new() -> Self {
        Self { now_ms: 1_800_000_000_000 }
    }

    fn call(&self, who: &AccountId, deposit: u128) {
        self.call_with(who, deposit, vec![]);
    }

    fn call_with(&self, who: &AccountId, deposit: u128, results: Vec<PromiseResult>) {
        let ctx = VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(who.clone())
            .signer_account_id(who.clone())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .account_balance(NearToken::from_near(10_000))
            .block_timestamp(self.now_ms * 1_000_000)
            .build();
        testing_env!(
            ctx,
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            results
        );
    }

    fn advance_sec(&mut self, seconds: u64) {
        self.now_ms += seconds * 1000;
    }
}

fn rules() -> Rules {
    Rules {
        trusted_after: 2,
        core_after: 4,
        auto_limit_trusted: U128(10 * NEAR),
        auto_limit_core: U128(50 * NEAR),
        reviewer_limit: U128(100 * NEAR),
        challenge_period_sec: 180,
        max_open_per_creator: 3,
        slash_points: 3,
    }
}

fn rate_card() -> Vec<Deliverable> {
    vec![
        Deliverable { name: "X thread".into(), amount: U128(5 * NEAR) },
        Deliverable { name: "Short video".into(), amount: U128(15 * NEAR) },
    ]
}

/// A contract with one campaign funded with 200 NEAR by `dao()`.
fn setup() -> (Contract, Env, u64) {
    let env = Env::new();
    env.call(&contract_id(), 0);
    let mut c = Contract::new();
    let id = launch(&mut c, &env, &dao(), 200);
    (c, env, id)
}

fn launch(c: &mut Contract, env: &Env, dao: &AccountId, budget_near: u128) -> u64 {
    env.call(dao, budget_near * NEAR);
    c.create_campaign(
        "Q4 ambassador push".into(),
        "https://example.org/brief".into(),
        rate_card(),
        vec![reviewer(), reviewer2()],
        Some(rules()),
    )
}

fn submit_line(c: &mut Contract, env: &Env, who: &AccountId, campaign: u64, line: u32) -> u64 {
    env.call(who, NEAR / 10);
    c.submit(campaign, Some(line), None, "https://x.com/cleo/status/1".into(), None)
}

fn submit_custom(c: &mut Contract, env: &Env, who: &AccountId, campaign: u64, near: u128) -> u64 {
    env.call(who, NEAR / 10);
    c.submit(campaign, None, Some(U128(near * NEAR)), "https://x.com/cleo/status/2".into(), None)
}

/// Runs the payout callback as if the transfer succeeded or failed.
fn settle(c: &mut Contract, env: &Env, submission: u64, ok: bool) -> bool {
    let result = if ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
    env.call_with(&contract_id(), 0, vec![result]);
    c.on_payout(submission)
}

/// Gives `creator()` `n` points with `dao()` through reviewed, paid work.
fn earn_points(c: &mut Contract, env: &Env, campaign: u64, n: u32) {
    for _ in 0..n {
        let id = submit_custom(c, env, &creator(), campaign, 1);
        env.call(&reviewer(), 0);
        let _ = c.approve(id);
        assert!(settle(c, env, id, true));
    }
}

fn campaign(c: &Contract, id: u64) -> CampaignView {
    c.get_campaign(id).unwrap()
}

fn status(c: &Contract, id: u64) -> SubmissionStatus {
    c.get_submission(id).unwrap().status
}

#[test]
fn campaign_is_funded_and_governed_by_its_dao() {
    let (c, _env, id) = setup();
    let view = campaign(&c, id);
    assert_eq!(view.campaign.dao, dao());
    assert_eq!(view.campaign.status, CampaignStatus::Active);
    assert!(view.campaign.budget.0 < 200 * NEAR, "storage is taken out of the budget");
    assert!(view.campaign.budget.0 > 199 * NEAR, "storage costs a small amount");
    assert_eq!(view.available, view.campaign.budget);
}

#[test]
#[should_panic(expected = "Attach at least 1 NEAR of budget")]
fn campaign_needs_a_real_budget() {
    let env = Env::new();
    env.call(&contract_id(), 0);
    let mut c = Contract::new();
    env.call(&dao(), NEAR / 2);
    c.create_campaign(
        "Tiny".into(),
        "https://example.org/brief".into(),
        rate_card(),
        vec![reviewer()],
        Some(rules()),
    );
}

#[test]
#[should_panic(expected = "The Core auto limit can't exceed the reviewer limit")]
fn rules_must_be_consistent() {
    let env = Env::new();
    env.call(&contract_id(), 0);
    let mut c = Contract::new();
    let mut bad = rules();
    bad.auto_limit_core = U128(500 * NEAR);
    env.call(&dao(), 10 * NEAR);
    c.create_campaign("Bad".into(), "https://example.org".into(), rate_card(), vec![reviewer()], Some(bad));
}

#[test]
fn newcomers_always_need_a_reviewer() {
    let (mut c, env, id) = setup();
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    let s = c.get_submission(sub).unwrap();
    assert_eq!(s.status, SubmissionStatus::Pending);
    assert_eq!(s.route, Route::Reviewer);
    assert_eq!(s.tier_at_submit, Tier::Newcomer);
    assert_eq!(campaign(&c, id).campaign.reserved.0, 0, "nothing reserved before a decision");
}

#[test]
fn large_requests_go_to_the_dao() {
    let (mut c, env, id) = setup();
    let sub = submit_custom(&mut c, &env, &creator(), id, 150);
    let s = c.get_submission(sub).unwrap();
    assert_eq!(s.status, SubmissionStatus::AwaitingDao);
    assert_eq!(s.route, Route::Dao);
}

#[test]
fn reviewer_approval_pays_and_builds_reputation() {
    let (mut c, env, id) = setup();
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    env.call(&reviewer(), 0);
    let _ = c.approve(sub);
    let view = campaign(&c, id);
    assert_eq!(view.campaign.paid.0, 5 * NEAR);
    assert_eq!(view.campaign.reserved.0, 0);
    assert_eq!(status(&c, sub), SubmissionStatus::Paid);

    assert!(settle(&mut c, &env, sub, true));
    let rep = c.get_reputation(dao(), creator());
    assert_eq!(rep.points, 1);
    assert_eq!(rep.paid_submissions, vec![sub]);
    assert_eq!(rep.total_earned.0, 5 * NEAR);
    assert_eq!(c.get_stats().payouts, 1);
}

#[test]
fn failed_transfer_rolls_back_and_can_be_claimed() {
    let (mut c, env, id) = setup();
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    env.call(&reviewer(), 0);
    let _ = c.approve(sub);
    assert!(!settle(&mut c, &env, sub, false));

    let view = campaign(&c, id);
    assert_eq!(view.campaign.paid.0, 0, "failed transfer is not counted as paid");
    assert_eq!(view.campaign.reserved.0, 5 * NEAR, "funds stay reserved for the retry");
    assert_eq!(status(&c, sub), SubmissionStatus::Approved);
    assert_eq!(c.get_reputation(dao(), creator()).points, 0);

    env.call(&creator(), 0);
    let _ = c.claim(sub);
    assert!(settle(&mut c, &env, sub, true));
    assert_eq!(campaign(&c, id).campaign.paid.0, 5 * NEAR);
    assert_eq!(c.get_reputation(dao(), creator()).points, 1);
}

#[test]
fn trusted_creators_are_paid_automatically_after_the_window() {
    let (mut c, mut env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    assert_eq!(c.get_tier(id, creator()).tier, Tier::Trusted);

    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    let s = c.get_submission(sub).unwrap();
    assert_eq!(s.status, SubmissionStatus::Challenge);
    assert_eq!(s.route, Route::Auto);
    assert_eq!(campaign(&c, id).campaign.reserved.0, 5 * NEAR, "auto payouts reserve funds");

    env.advance_sec(181);
    env.call(&acc("anyone.near"), 0);
    let _ = c.finalize(sub);
    assert!(settle(&mut c, &env, sub, true));
    assert_eq!(status(&c, sub), SubmissionStatus::Paid);
    assert_eq!(c.get_reputation(dao(), creator()).points, 3);
}

#[test]
#[should_panic(expected = "The challenge window hasn't ended yet")]
fn automatic_payouts_wait_for_the_window() {
    let (mut c, env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    env.call(&acc("anyone.near"), 0);
    let _ = c.finalize(sub);
}

#[test]
fn trusted_creators_still_need_review_above_their_limit() {
    let (mut c, env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    let sub = submit_line(&mut c, &env, &creator(), id, 1); // 15 NEAR, Trusted limit is 10
    assert_eq!(status(&c, sub), SubmissionStatus::Pending);
}

#[test]
fn custom_amounts_never_skip_review() {
    let (mut c, env, id) = setup();
    earn_points(&mut c, &env, id, 4);
    assert_eq!(c.get_tier(id, creator()).tier, Tier::Core);
    let sub = submit_custom(&mut c, &env, &creator(), id, 2);
    assert_eq!(status(&c, sub), SubmissionStatus::Pending);
}

#[test]
fn veto_slashes_reputation_and_fraud_bans() {
    let (mut c, env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    let sub = submit_line(&mut c, &env, &creator(), id, 0);

    env.call(&reviewer2(), 0);
    c.veto(sub, "Post was deleted after an hour".into(), true);
    assert_eq!(status(&c, sub), SubmissionStatus::Vetoed);
    assert_eq!(campaign(&c, id).campaign.reserved.0, 0, "veto releases the reservation");
    let rep = c.get_reputation(dao(), creator());
    assert_eq!(rep.points, 0, "2 points minus 3, floored at 0");
    assert_eq!(rep.slashed_submissions, vec![sub]);
    assert!(rep.banned);
}

#[test]
#[should_panic(expected = "banned")]
fn banned_creators_cannot_submit() {
    let (mut c, env, id) = setup();
    env.call(&dao(), 0);
    c.dao_set_ban(creator(), true);
    submit_line(&mut c, &env, &creator(), id, 0);
}

#[test]
fn the_dao_can_lift_a_ban() {
    let (mut c, env, id) = setup();
    env.call(&dao(), 0);
    c.dao_set_ban(creator(), true);
    c.dao_set_ban(creator(), false);
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    assert_eq!(status(&c, sub), SubmissionStatus::Pending);
}

#[test]
#[should_panic(expected = "Only a reviewer of this campaign can do this")]
fn only_reviewers_can_approve() {
    let (mut c, env, id) = setup();
    let sub = submit_line(&mut c, &env, &creator(), id, 0);
    env.call(&acc("mallory.near"), 0);
    let _ = c.approve(sub);
}

#[test]
#[should_panic(expected = "Reviewers can't submit to a campaign they review")]
fn reviewers_cannot_pay_themselves() {
    let (mut c, env, id) = setup();
    submit_line(&mut c, &env, &reviewer(), id, 0);
}

#[test]
#[should_panic(expected = "Above the reviewer limit")]
fn reviewers_cannot_approve_above_their_limit() {
    let (mut c, env, id) = setup();
    let sub = submit_custom(&mut c, &env, &creator(), id, 90);
    // The DAO lowers the reviewer limit after the submission was made.
    let mut tighter = rules();
    tighter.reviewer_limit = U128(50 * NEAR);
    env.call(&dao(), NEAR / 10);
    c.update_campaign(id, None, Some(tighter), None, None);
    env.call(&reviewer(), 0);
    let _ = c.approve(sub);
}

#[test]
#[should_panic(expected = "Only the campaign's DAO can do this")]
fn only_the_dao_changes_the_rules() {
    let (mut c, env, id) = setup();
    env.call(&reviewer(), NEAR / 10);
    c.update_campaign(id, Some(vec![acc("mallory.near")]), None, None, None);
}

#[test]
fn escalated_work_is_paid_by_a_dao_vote() {
    let (mut c, env, id) = setup();
    let sub = submit_line(&mut c, &env, &creator(), id, 1);
    env.call(&reviewer(), 0);
    c.escalate(sub);
    assert_eq!(status(&c, sub), SubmissionStatus::AwaitingDao);

    let proposal = c.get_dao_proposal(sub).expect("a proposal is available while undecided");
    let SputnikProposalKind::FunctionCall { receiver_id, actions } = proposal.kind;
    assert_eq!(receiver_id, contract_id());
    assert_eq!(actions[0].method_name, "dao_approve");
    let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(&actions[0].args.0).unwrap();
    assert_eq!(args["submission_id"], sub);
    assert!(proposal.description.contains("pay 15 NEAR to cleo.near"));

    env.call(&dao(), 0);
    let _ = c.dao_approve(sub);
    assert!(settle(&mut c, &env, sub, true));
    assert_eq!(status(&c, sub), SubmissionStatus::Paid);
    assert!(c.get_dao_proposal(sub).is_none(), "no proposal once decided");
}

#[test]
#[should_panic(expected = "enough budget")]
fn budget_cannot_be_overspent() {
    let (mut c, env, id) = setup();
    let first = submit_custom(&mut c, &env, &creator(), id, 99);
    env.call(&reviewer(), 0);
    let _ = c.approve(first);
    let second = submit_custom(&mut c, &env, &acc("dan.near"), id, 99);
    env.call(&reviewer(), 0);
    let _ = c.approve(second);
    // About 2 NEAR is left; a third 99 NEAR request is refused at submission.
    submit_custom(&mut c, &env, &acc("eve.near"), id, 99);
}

#[test]
fn reputation_is_scoped_to_each_dao() {
    let (mut c, env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    let elsewhere = launch(&mut c, &env, &other_dao(), 50);
    assert_eq!(c.get_tier(id, creator()).tier, Tier::Trusted);
    assert_eq!(c.get_tier(elsewhere, creator()).tier, Tier::Newcomer);
    let sub = submit_line(&mut c, &env, &creator(), elsewhere, 0);
    assert_eq!(status(&c, sub), SubmissionStatus::Pending);
}

#[test]
#[should_panic(expected = "Too many open submissions")]
fn creators_have_an_open_submission_limit() {
    let (mut c, env, id) = setup();
    for _ in 0..4 {
        submit_line(&mut c, &env, &creator(), id, 0);
    }
}

#[test]
fn closing_refunds_the_dao_and_keeps_scheduled_payouts() {
    let (mut c, mut env, id) = setup();
    earn_points(&mut c, &env, id, 2);
    let scheduled = submit_line(&mut c, &env, &creator(), id, 0);
    let before = campaign(&c, id);

    env.call(&dao(), 0);
    let _ = c.close_campaign(id);
    let after = campaign(&c, id);
    assert_eq!(after.campaign.status, CampaignStatus::Closed);
    assert_eq!(after.available.0, 0, "everything unreserved went back to the DAO");
    assert_eq!(after.campaign.reserved, before.campaign.reserved);

    env.advance_sec(181);
    env.call(&acc("anyone.near"), 0);
    let _ = c.finalize(scheduled);
    assert!(settle(&mut c, &env, scheduled, true));
    assert_eq!(status(&c, scheduled), SubmissionStatus::Paid);
}

#[test]
fn submitting_charges_the_creator_for_storage_only() {
    let (mut c, env, id) = setup();
    let budget_before = campaign(&c, id).campaign.budget;
    submit_line(&mut c, &env, &creator(), id, 0);
    assert_eq!(
        campaign(&c, id).campaign.budget,
        budget_before,
        "submissions never touch the treasury's budget"
    );
}

#[test]
fn views_page_through_history() {
    let (mut c, env, id) = setup();
    let a = submit_line(&mut c, &env, &creator(), id, 0);
    let b = submit_line(&mut c, &env, &acc("dan.near"), id, 0);
    let all = c.get_campaign_submissions(id, None, None);
    assert_eq!(all.iter().map(|s| s.id).collect::<Vec<_>>(), vec![a, b]);
    let second_page = c.get_campaign_submissions(id, Some(1), Some(10));
    assert_eq!(second_page.len(), 1);
    assert_eq!(c.get_creator_submissions(creator(), None, None).len(), 1);
    let stats = c.get_stats();
    assert_eq!((stats.campaigns, stats.submissions, stats.creators), (1, 2, 2));
}

#[test]
fn near_amounts_are_formatted_for_people() {
    assert_eq!(crate::views::format_near(5 * NEAR), "5");
    assert_eq!(crate::views::format_near(5 * NEAR / 2), "2.5");
    assert_eq!(crate::views::format_near(NEAR / 1000), "0.001");
}
