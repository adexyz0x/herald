//! TrustLadder: ambassador and creator payouts that earn trust, on top of a Sputnik DAO treasury.
//!
//! A DAO funds a campaign once. Each payout is then approved by the cheapest route the creator
//! has earned: automatic after a public challenge window, one reviewer, or a full DAO vote.
//! See `docs/DESIGN.md` for the rules and the threat model.
//!
//! The contract has no owner and no upgrade method. Every privileged call checks that the caller
//! is the campaign's DAO or one of the reviewers the DAO appointed.

use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

mod campaign;
mod events;
mod payout;
mod submission;
mod types;
mod validation;
mod views;

pub use types::*;

/// Gas reserved for the payout callback.
pub(crate) const GAS_FOR_PAYOUT_CALLBACK: near_sdk::Gas = near_sdk::Gas::from_tgas(10);
/// Gas a DAO proposal should attach when it calls `dao_approve` or `dao_reject`.
pub(crate) const GAS_FOR_DAO_CALL: near_sdk::Gas = near_sdk::Gas::from_tgas(60);
/// Smallest budget a campaign can start with.
pub(crate) const MIN_CAMPAIGN_BUDGET: NearToken = NearToken::from_near(1);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Campaigns,
    Submissions,
    CampaignSubmissions,
    CreatorSubmissions,
    Reputation,
    OpenCounts,
    Creators,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    campaigns: LookupMap<u64, Campaign>,
    submissions: LookupMap<u64, Submission>,
    campaign_submissions: LookupMap<u64, Vec<u64>>,
    creator_submissions: LookupMap<AccountId, Vec<u64>>,
    /// Reputation is scoped per DAO: (dao, creator).
    reputation: LookupMap<(AccountId, AccountId), Reputation>,
    /// Open submissions per (campaign, creator).
    open_counts: LookupMap<(u64, AccountId), u32>,
    creators: LookupSet<AccountId>,
    campaign_count: u64,
    submission_count: u64,
    creator_count: u64,
    payout_count: u64,
    total_paid: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            campaigns: LookupMap::new(StorageKey::Campaigns),
            submissions: LookupMap::new(StorageKey::Submissions),
            campaign_submissions: LookupMap::new(StorageKey::CampaignSubmissions),
            creator_submissions: LookupMap::new(StorageKey::CreatorSubmissions),
            reputation: LookupMap::new(StorageKey::Reputation),
            open_counts: LookupMap::new(StorageKey::OpenCounts),
            creators: LookupSet::new(StorageKey::Creators),
            campaign_count: 0,
            submission_count: 0,
            creator_count: 0,
            payout_count: 0,
            total_paid: 0,
        }
    }
}

impl Contract {
    pub(crate) fn campaign(&self, campaign_id: u64) -> Campaign {
        self.campaigns
            .get(&campaign_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Campaign not found"))
    }

    pub(crate) fn submission(&self, submission_id: u64) -> Submission {
        self.submissions
            .get(&submission_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Submission not found"))
    }

    pub(crate) fn save_campaign(&mut self, campaign: Campaign) {
        self.campaigns.insert(campaign.id, campaign);
    }

    pub(crate) fn save_submission(&mut self, submission: Submission) {
        self.submissions.insert(submission.id, submission);
    }

    pub(crate) fn reputation_of(&self, dao: &AccountId, creator: &AccountId) -> Reputation {
        self.reputation
            .get(&(dao.clone(), creator.clone()))
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn save_reputation(&mut self, dao: &AccountId, creator: &AccountId, rep: Reputation) {
        self.reputation.insert((dao.clone(), creator.clone()), rep);
    }

    pub(crate) fn tier_for(rules: &Rules, points: u32) -> Tier {
        if points >= rules.core_after {
            Tier::Core
        } else if points >= rules.trusted_after {
            Tier::Trusted
        } else {
            Tier::Newcomer
        }
    }

    pub(crate) fn auto_limit_for(rules: &Rules, tier: Tier) -> u128 {
        match tier {
            Tier::Newcomer => 0,
            Tier::Trusted => rules.auto_limit_trusted.0,
            Tier::Core => rules.auto_limit_core.0,
        }
    }

    pub(crate) fn assert_dao(campaign: &Campaign) {
        require!(
            env::predecessor_account_id() == campaign.dao,
            "Only the campaign's DAO can do this"
        );
    }

    pub(crate) fn assert_reviewer(campaign: &Campaign, submission: &Submission) -> AccountId {
        let caller = env::predecessor_account_id();
        require!(
            campaign.reviewers.contains(&caller),
            "Only a reviewer of this campaign can do this"
        );
        require!(caller != submission.creator, "Reviewers can't decide on their own work");
        caller
    }

    /// Lowers a creator's open-submission count once a submission leaves an open status.
    pub(crate) fn release_open_slot(&mut self, campaign_id: u64, creator: &AccountId) {
        let key = (campaign_id, creator.clone());
        let count = self.open_counts.get(&key).copied().unwrap_or(0);
        self.open_counts.insert(key, count.saturating_sub(1));
    }

    /// Writes every buffered collection change to storage, so `env::storage_usage()` is accurate.
    pub(crate) fn flush_all(&mut self) {
        self.campaigns.flush();
        self.submissions.flush();
        self.campaign_submissions.flush();
        self.creator_submissions.flush();
        self.reputation.flush();
        self.open_counts.flush();
        // LookupSet writes through immediately and has nothing to flush.
    }

    /// Storage added since `initial_usage`, priced at the current byte cost.
    pub(crate) fn storage_cost_since(&mut self, initial_usage: u64) -> NearToken {
        self.flush_all();
        let used = env::storage_usage().saturating_sub(initial_usage);
        env::storage_byte_cost().saturating_mul(used as u128)
    }

    /// Charges the storage a call added to `payer`, from `attached`, and refunds the rest.
    /// Returns the amount charged.
    pub(crate) fn settle_storage(
        &mut self,
        initial_usage: u64,
        attached: NearToken,
        payer: &AccountId,
    ) -> NearToken {
        let cost = self.storage_cost_since(initial_usage);
        require!(
            attached >= cost,
            format!(
                "Attach at least {} yoctoNEAR to cover storage",
                cost.as_yoctonear()
            )
        );
        let refund = attached.saturating_sub(cost);
        if !refund.is_zero() {
            Promise::new(payer.clone()).transfer(refund).detach();
        }
        cost
    }

    pub(crate) fn now_ms() -> u64 {
        env::block_timestamp_ms()
    }
}

#[cfg(test)]
mod tests;
