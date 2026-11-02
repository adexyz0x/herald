use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{near, AccountId, Gas, NearToken};

/// One line of a campaign's rate card, e.g. "X thread" paid 5 NEAR.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Deliverable {
    pub name: String,
    /// Payout in yoctoNEAR.
    pub amount: U128,
}

/// Approval rules for a campaign. Set by the DAO, changed only by another DAO proposal.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Rules {
    /// Reputation points in this DAO needed to reach the Trusted tier.
    pub trusted_after: u32,
    /// Reputation points in this DAO needed to reach the Core tier.
    pub core_after: u32,
    /// Largest rate-card payout a Trusted creator receives without review (yoctoNEAR).
    pub auto_limit_trusted: U128,
    /// Largest rate-card payout a Core creator receives without review (yoctoNEAR).
    pub auto_limit_core: U128,
    /// Largest payout a single reviewer may approve. Anything above needs a DAO vote (yoctoNEAR).
    pub reviewer_limit: U128,
    /// How long an automatic payout waits before it can be finalized, in seconds.
    pub challenge_period_sec: u32,
    /// Most open submissions one creator may have in this campaign at once.
    pub max_open_per_creator: u32,
    /// Reputation points removed when a payout is vetoed.
    pub slash_points: u32,
}

impl Default for Rules {
    fn default() -> Self {
        Self {
            trusted_after: 3,
            core_after: 10,
            auto_limit_trusted: U128(NearToken::from_near(10).as_yoctonear()),
            auto_limit_core: U128(NearToken::from_near(50).as_yoctonear()),
            reviewer_limit: U128(NearToken::from_near(100).as_yoctonear()),
            challenge_period_sec: 24 * 60 * 60,
            max_open_per_creator: 3,
            slash_points: 3,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CampaignStatus {
    Active,
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Campaign {
    pub id: u64,
    /// The DAO that created, funded and governs this campaign.
    pub dao: AccountId,
    pub title: String,
    pub brief_url: String,
    pub rate_card: Vec<Deliverable>,
    pub reviewers: Vec<AccountId>,
    pub rules: Rules,
    /// Total funded by the DAO, in yoctoNEAR. Storage costs are never part of the budget.
    pub budget: U128,
    /// Approved or in a challenge window, not yet paid.
    pub reserved: U128,
    pub paid: U128,
    pub status: CampaignStatus,
    pub created_at_ms: u64,
    pub submission_count: u64,
    pub payout_count: u64,
}

impl Campaign {
    /// Budget not yet reserved or paid.
    pub fn available(&self) -> u128 {
        self.budget.0 - self.reserved.0 - self.paid.0
    }
}

#[near(serializers = [json])]
pub struct CampaignView {
    #[serde(flatten)]
    pub campaign: Campaign,
    pub available: U128,
}

/// How much trust a creator has earned with a DAO.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Tier {
    Newcomer,
    Trusted,
    Core,
}

/// Which approval route a submission takes.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Route {
    /// Paid automatically after a public challenge window.
    Auto,
    /// Needs one reviewer.
    Reviewer,
    /// Needs a DAO proposal.
    Dao,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SubmissionStatus {
    /// Waiting for a reviewer.
    Pending,
    /// Approved automatically, waiting for the challenge window to end.
    Challenge,
    /// Waiting for a DAO vote.
    AwaitingDao,
    /// Approved, but the transfer failed. The creator can retry with `claim`.
    Approved,
    Paid,
    Rejected,
    Vetoed,
}

impl SubmissionStatus {
    /// Statuses that count against a creator's open-submission limit.
    pub fn is_open(self) -> bool {
        matches!(
            self,
            SubmissionStatus::Pending | SubmissionStatus::Challenge | SubmissionStatus::AwaitingDao
        )
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Submission {
    pub id: u64,
    pub campaign_id: u64,
    pub dao: AccountId,
    pub creator: AccountId,
    /// Rate-card line name, or "Custom".
    pub deliverable: String,
    pub custom: bool,
    pub amount: U128,
    pub proof_url: String,
    pub note: String,
    pub tier_at_submit: Tier,
    pub route: Route,
    pub status: SubmissionStatus,
    pub created_at_ms: u64,
    pub challenge_ends_at_ms: Option<u64>,
    pub decided_by: Option<AccountId>,
    pub decided_at_ms: Option<u64>,
    pub reason: Option<String>,
    pub paid_at_ms: Option<u64>,
}

/// A creator's record with one DAO.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Reputation {
    pub points: u32,
    pub paid_count: u32,
    pub slashed_count: u32,
    pub total_earned: U128,
    pub banned: bool,
    /// Every paid submission behind the points.
    pub paid_submissions: Vec<u64>,
    /// Every vetoed submission that cost points.
    pub slashed_submissions: Vec<u64>,
}

#[near(serializers = [json])]
pub struct TierView {
    pub tier: Tier,
    pub points: u32,
    pub banned: bool,
    /// Points needed for the next tier, if there is one.
    pub next_tier_at: Option<u32>,
    /// Largest rate-card payout this creator gets without review in this campaign.
    pub auto_limit: U128,
}

#[near(serializers = [json])]
pub struct Stats {
    pub campaigns: u64,
    pub submissions: u64,
    pub creators: u64,
    pub payouts: u64,
    pub total_paid: U128,
}

/// One action of a Sputnik DAO `FunctionCall` proposal, in the exact shape Sputnik expects.
#[near(serializers = [json])]
pub struct SputnikActionCall {
    pub method_name: String,
    pub args: Base64VecU8,
    pub deposit: NearToken,
    pub gas: Gas,
}

#[near(serializers = [json])]
pub enum SputnikProposalKind {
    FunctionCall {
        receiver_id: AccountId,
        actions: Vec<SputnikActionCall>,
    },
}

/// Ready-to-submit argument for Sputnik's `add_proposal`.
#[near(serializers = [json])]
pub struct SputnikProposalInput {
    pub description: String,
    pub kind: SputnikProposalKind,
}
