//! Submissions and the decisions on them: creators submit, reviewers and the DAO decide,
//! anyone finalizes an automatic payout once its challenge window ends.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, Promise};

use crate::events::emit;
use crate::types::*;
use crate::validation;
use crate::{Contract, ContractExt};

#[near]
impl Contract {
    /// Submits work to a campaign and returns the submission id.
    ///
    /// Pass `deliverable_index` for a rate-card line, or `custom_amount` (yoctoNEAR) for anything
    /// else. Custom amounts always need a human decision. Attach a small deposit for storage;
    /// whatever isn't used is refunded.
    #[payable]
    pub fn submit(
        &mut self,
        campaign_id: u64,
        deliverable_index: Option<u32>,
        custom_amount: Option<U128>,
        proof_url: String,
        note: Option<String>,
    ) -> u64 {
        let initial_usage = env::storage_usage();
        let creator = env::predecessor_account_id();
        let mut campaign = self.campaign(campaign_id);
        require!(
            campaign.status == CampaignStatus::Active,
            "Campaign is closed"
        );
        require!(
            creator != campaign.dao,
            "The DAO can't submit to its own campaign"
        );
        require!(
            !campaign.reviewers.contains(&creator),
            "Reviewers can't submit to a campaign they review"
        );
        let note = note.unwrap_or_default();
        validation::url(&proof_url, "Proof link");
        validation::note(&note);

        let (deliverable, amount, custom) = match (deliverable_index, custom_amount) {
            (Some(index), None) => {
                let line = campaign
                    .rate_card
                    .get(index as usize)
                    .unwrap_or_else(|| env::panic_str("No such rate-card line"));
                (line.name.clone(), line.amount.0, false)
            }
            (None, Some(amount)) => {
                require!(amount.0 > 0, "Custom amount must be above zero");
                ("Custom".to_string(), amount.0, true)
            }
            _ => env::panic_str("Pass either deliverable_index or custom_amount"),
        };
        require!(
            amount <= campaign.available(),
            "The campaign doesn't have enough budget left for this"
        );

        let rep = self.reputation_of(&campaign.dao, &creator);
        require!(
            !rep.banned,
            "This account is banned from this DAO's campaigns"
        );
        let open_key = (campaign_id, creator.clone());
        let open = self.open_counts.get(&open_key).copied().unwrap_or(0);
        require!(
            open < campaign.rules.max_open_per_creator,
            "Too many open submissions in this campaign"
        );

        let tier = Self::tier_for(&campaign.rules, rep.points);
        let now = Self::now_ms();
        let (route, status, challenge_ends_at_ms) =
            if !custom && amount <= Self::auto_limit_for(&campaign.rules, tier) {
                campaign.reserved = U128(campaign.reserved.0 + amount);
                let ends = now + u64::from(campaign.rules.challenge_period_sec) * 1000;
                (Route::Auto, SubmissionStatus::Challenge, Some(ends))
            } else if amount <= campaign.rules.reviewer_limit.0 {
                (Route::Reviewer, SubmissionStatus::Pending, None)
            } else {
                (Route::Dao, SubmissionStatus::AwaitingDao, None)
            };

        let id = self.submission_count;
        self.submission_count += 1;
        campaign.submission_count += 1;
        let submission = Submission {
            id,
            campaign_id,
            dao: campaign.dao.clone(),
            creator: creator.clone(),
            deliverable,
            custom,
            amount: U128(amount),
            proof_url,
            note,
            tier_at_submit: tier,
            route,
            status,
            created_at_ms: now,
            challenge_ends_at_ms,
            decided_by: None,
            decided_at_ms: None,
            reason: None,
            paid_at_ms: None,
        };
        self.save_submission(submission.clone());
        self.save_campaign(campaign);

        let mut ids = self
            .campaign_submissions
            .get(&campaign_id)
            .cloned()
            .unwrap_or_default();
        ids.push(id);
        self.campaign_submissions.insert(campaign_id, ids);
        let mut mine = self
            .creator_submissions
            .get(&creator)
            .cloned()
            .unwrap_or_default();
        mine.push(id);
        self.creator_submissions.insert(creator.clone(), mine);
        self.open_counts.insert(open_key, open + 1);
        if self.creators.insert(creator.clone()) {
            self.creator_count += 1;
        }

        self.settle_storage(initial_usage, env::attached_deposit(), &creator);

        emit(
            "submission_created",
            json!({
                "submission_id": id,
                "campaign_id": campaign_id,
                "creator": creator,
                "deliverable": submission.deliverable,
                "amount": submission.amount,
                "tier": tier,
                "route": route,
                "status": status,
                "challenge_ends_at_ms": challenge_ends_at_ms,
            }),
        );
        id
    }

    /// A reviewer approves a pending submission. The payout is sent immediately.
    pub fn approve(&mut self, submission_id: u64) -> Promise {
        let mut sub = self.submission(submission_id);
        let mut campaign = self.campaign(sub.campaign_id);
        let reviewer = Self::assert_reviewer(&campaign, &sub);
        require!(
            sub.status == SubmissionStatus::Pending,
            "Only pending submissions can be approved by a reviewer"
        );
        require!(
            campaign.status == CampaignStatus::Active,
            "Campaign is closed"
        );
        require!(
            sub.amount.0 <= campaign.rules.reviewer_limit.0,
            "Above the reviewer limit: this needs a DAO vote"
        );
        require!(
            sub.amount.0 <= campaign.available(),
            "The campaign doesn't have enough budget left for this"
        );

        campaign.reserved = U128(campaign.reserved.0 + sub.amount.0);
        sub.decided_by = Some(reviewer.clone());
        sub.decided_at_ms = Some(Self::now_ms());
        self.save_campaign(campaign);
        self.release_open_slot(sub.campaign_id, &sub.creator);
        emit(
            "submission_approved",
            json!({ "submission_id": submission_id, "by": reviewer, "route": Route::Reviewer }),
        );
        self.start_payout(sub)
    }

    /// A reviewer rejects a pending submission. No reputation is lost.
    pub fn reject(&mut self, submission_id: u64, reason: String) {
        let mut sub = self.submission(submission_id);
        let campaign = self.campaign(sub.campaign_id);
        let reviewer = Self::assert_reviewer(&campaign, &sub);
        require!(
            sub.status == SubmissionStatus::Pending,
            "Only pending submissions can be rejected by a reviewer"
        );
        validation::reason(&reason);
        sub.status = SubmissionStatus::Rejected;
        sub.decided_by = Some(reviewer.clone());
        sub.decided_at_ms = Some(Self::now_ms());
        sub.reason = Some(reason.clone());
        self.release_open_slot(sub.campaign_id, &sub.creator);
        self.save_submission(sub);
        emit(
            "submission_rejected",
            json!({ "submission_id": submission_id, "by": reviewer, "reason": reason }),
        );
    }

    /// A reviewer stops an automatic payout during its challenge window. The creator loses
    /// `slash_points` reputation with this DAO, and is banned if `fraud` is true.
    pub fn veto(&mut self, submission_id: u64, reason: String, fraud: bool) {
        let mut sub = self.submission(submission_id);
        let mut campaign = self.campaign(sub.campaign_id);
        let reviewer = Self::assert_reviewer(&campaign, &sub);
        require!(
            sub.status == SubmissionStatus::Challenge,
            "Only automatic payouts in their challenge window can be vetoed"
        );
        let ends = sub.challenge_ends_at_ms.unwrap_or(0);
        require!(Self::now_ms() < ends, "The challenge window has ended");
        validation::reason(&reason);

        campaign.reserved = U128(campaign.reserved.0 - sub.amount.0);
        sub.status = SubmissionStatus::Vetoed;
        sub.decided_by = Some(reviewer.clone());
        sub.decided_at_ms = Some(Self::now_ms());
        sub.reason = Some(reason.clone());

        let mut rep = self.reputation_of(&sub.dao, &sub.creator);
        rep.points = rep.points.saturating_sub(campaign.rules.slash_points);
        rep.slashed_count += 1;
        rep.slashed_submissions.push(submission_id);
        if fraud {
            rep.banned = true;
        }
        let (points, banned) = (rep.points, rep.banned);
        self.save_reputation(&sub.dao, &sub.creator, rep);
        self.release_open_slot(sub.campaign_id, &sub.creator);
        self.save_campaign(campaign);
        let (dao, creator) = (sub.dao.clone(), sub.creator.clone());
        self.save_submission(sub);

        emit(
            "submission_vetoed",
            json!({ "submission_id": submission_id, "by": reviewer, "reason": reason, "fraud": fraud }),
        );
        emit(
            "reputation_changed",
            json!({ "dao": dao, "account_id": creator, "points": points, "banned": banned }),
        );
    }

    /// A reviewer hands a pending submission to the DAO instead of deciding alone.
    pub fn escalate(&mut self, submission_id: u64) {
        let mut sub = self.submission(submission_id);
        let campaign = self.campaign(sub.campaign_id);
        let reviewer = Self::assert_reviewer(&campaign, &sub);
        require!(
            sub.status == SubmissionStatus::Pending,
            "Only pending submissions can be escalated"
        );
        sub.status = SubmissionStatus::AwaitingDao;
        sub.route = Route::Dao;
        self.save_submission(sub);
        emit(
            "submission_escalated",
            json!({ "submission_id": submission_id, "by": reviewer }),
        );
    }

    /// The DAO approves any submission that is still waiting for a decision.
    /// Called by the DAO account when a Sputnik proposal from `get_dao_proposal` passes.
    pub fn dao_approve(&mut self, submission_id: u64) -> Promise {
        let mut sub = self.submission(submission_id);
        let mut campaign = self.campaign(sub.campaign_id);
        Self::assert_dao(&campaign);
        match sub.status {
            SubmissionStatus::Pending | SubmissionStatus::AwaitingDao => {
                require!(
                    sub.amount.0 <= campaign.available(),
                    "The campaign doesn't have enough budget left for this"
                );
                campaign.reserved = U128(campaign.reserved.0 + sub.amount.0);
            }
            SubmissionStatus::Challenge => {}
            _ => env::panic_str("This submission isn't waiting for a decision"),
        }
        sub.decided_by = Some(campaign.dao.clone());
        sub.decided_at_ms = Some(Self::now_ms());
        let dao = campaign.dao.clone();
        self.save_campaign(campaign);
        self.release_open_slot(sub.campaign_id, &sub.creator);
        emit(
            "submission_approved",
            json!({ "submission_id": submission_id, "by": dao, "route": Route::Dao }),
        );
        self.start_payout(sub)
    }

    /// The DAO rejects any submission that is still waiting for a decision. No reputation is lost;
    /// use `dao_set_ban` for abuse.
    pub fn dao_reject(&mut self, submission_id: u64, reason: String) {
        let mut sub = self.submission(submission_id);
        let mut campaign = self.campaign(sub.campaign_id);
        Self::assert_dao(&campaign);
        validation::reason(&reason);
        match sub.status {
            SubmissionStatus::Pending | SubmissionStatus::AwaitingDao => {}
            SubmissionStatus::Challenge => {
                campaign.reserved = U128(campaign.reserved.0 - sub.amount.0);
            }
            _ => env::panic_str("This submission isn't waiting for a decision"),
        }
        sub.status = SubmissionStatus::Rejected;
        sub.decided_by = Some(campaign.dao.clone());
        sub.decided_at_ms = Some(Self::now_ms());
        sub.reason = Some(reason.clone());
        let dao = campaign.dao.clone();
        self.save_campaign(campaign);
        self.release_open_slot(sub.campaign_id, &sub.creator);
        self.save_submission(sub);
        emit(
            "submission_rejected",
            json!({ "submission_id": submission_id, "by": dao, "reason": reason }),
        );
    }

    /// Pays an automatic payout once its challenge window has ended. Anyone can call this.
    pub fn finalize(&mut self, submission_id: u64) -> Promise {
        let mut sub = self.submission(submission_id);
        require!(
            sub.status == SubmissionStatus::Challenge,
            "Only automatic payouts can be finalized"
        );
        let ends = sub.challenge_ends_at_ms.unwrap_or(u64::MAX);
        require!(
            Self::now_ms() >= ends,
            "The challenge window hasn't ended yet"
        );
        sub.decided_at_ms = Some(Self::now_ms());
        self.release_open_slot(sub.campaign_id, &sub.creator);
        emit(
            "submission_approved",
            json!({ "submission_id": submission_id, "by": null, "route": Route::Auto }),
        );
        self.start_payout(sub)
    }

    /// Retries a payout whose transfer failed. Anyone can call this.
    pub fn claim(&mut self, submission_id: u64) -> Promise {
        let sub = self.submission(submission_id);
        require!(
            sub.status == SubmissionStatus::Approved,
            "Only approved payouts whose transfer failed can be claimed"
        );
        self.start_payout(sub)
    }
}
