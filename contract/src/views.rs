//! Read-only methods. Lists are paginated with `from_index` and `limit` (max 100).

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, NearToken};

use crate::types::*;
use crate::{Contract, ContractExt, GAS_FOR_DAO_CALL};

const MAX_LIMIT: u64 = 100;

fn page(len: u64, from_index: Option<u64>, limit: Option<u64>) -> std::ops::Range<u64> {
    let from = from_index.unwrap_or(0).min(len);
    let limit = limit.unwrap_or(50).min(MAX_LIMIT);
    from..(from + limit).min(len)
}

/// Formats yoctoNEAR as NEAR with up to 4 decimals, e.g. 2.5.
pub(crate) fn format_near(yocto: u128) -> String {
    let one = NearToken::from_near(1).as_yoctonear();
    let whole = yocto / one;
    let frac = (yocto % one) / (one / 10_000);
    if frac == 0 {
        whole.to_string()
    } else {
        format!("{whole}.{frac:04}").trim_end_matches('0').to_string()
    }
}

#[near]
impl Contract {
    pub fn get_campaign(&self, campaign_id: u64) -> Option<CampaignView> {
        self.campaigns.get(&campaign_id).map(|c| CampaignView {
            available: U128(c.available()),
            campaign: c.clone(),
        })
    }

    pub fn get_campaigns(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<CampaignView> {
        page(self.campaign_count, from_index, limit)
            .filter_map(|id| self.get_campaign(id))
            .collect()
    }

    pub fn get_submission(&self, submission_id: u64) -> Option<Submission> {
        self.submissions.get(&submission_id).cloned()
    }

    pub fn get_campaign_submissions(
        &self,
        campaign_id: u64,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Submission> {
        let ids = self.campaign_submissions.get(&campaign_id).cloned().unwrap_or_default();
        page(ids.len() as u64, from_index, limit)
            .filter_map(|i| self.get_submission(ids[i as usize]))
            .collect()
    }

    pub fn get_creator_submissions(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Submission> {
        let ids = self.creator_submissions.get(&account_id).cloned().unwrap_or_default();
        page(ids.len() as u64, from_index, limit)
            .filter_map(|i| self.get_submission(ids[i as usize]))
            .collect()
    }

    /// A creator's record with one DAO. Trust is never shared between DAOs.
    pub fn get_reputation(&self, dao: AccountId, account_id: AccountId) -> Reputation {
        self.reputation_of(&dao, &account_id)
    }

    /// The tier a creator has in a campaign, and what it unlocks.
    pub fn get_tier(&self, campaign_id: u64, account_id: AccountId) -> TierView {
        let campaign = self.campaign(campaign_id);
        let rep = self.reputation_of(&campaign.dao, &account_id);
        let tier = Self::tier_for(&campaign.rules, rep.points);
        let next_tier_at = match tier {
            Tier::Newcomer => Some(campaign.rules.trusted_after),
            Tier::Trusted => Some(campaign.rules.core_after),
            Tier::Core => None,
        };
        TierView {
            tier,
            points: rep.points,
            banned: rep.banned,
            next_tier_at,
            auto_limit: U128(Self::auto_limit_for(&campaign.rules, tier)),
        }
    }

    /// The exact Sputnik `add_proposal` argument that asks the DAO to approve this submission.
    /// Returns nothing once the submission has been decided.
    pub fn get_dao_proposal(&self, submission_id: u64) -> Option<SputnikProposalInput> {
        let sub = self.get_submission(submission_id)?;
        if !matches!(
            sub.status,
            SubmissionStatus::Pending | SubmissionStatus::AwaitingDao | SubmissionStatus::Challenge
        ) {
            return None;
        }
        let campaign = self.campaign(sub.campaign_id);
        let description = format!(
            "Herald: pay {} NEAR to {} for submission #{} ({}) in \"{}\". Proof: {}",
            format_near(sub.amount.0),
            sub.creator,
            sub.id,
            sub.deliverable,
            campaign.title,
            sub.proof_url
        );
        let args = json!({ "submission_id": submission_id }).to_string().into_bytes();
        Some(SputnikProposalInput {
            description,
            kind: SputnikProposalKind::FunctionCall {
                receiver_id: env::current_account_id(),
                actions: vec![SputnikActionCall {
                    method_name: "dao_approve".to_string(),
                    args: Base64VecU8::from(args),
                    deposit: NearToken::from_yoctonear(0),
                    gas: GAS_FOR_DAO_CALL,
                }],
            },
        })
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            campaigns: self.campaign_count,
            submissions: self.submission_count,
            creators: self.creator_count,
            payouts: self.payout_count,
            total_paid: U128(self.total_paid),
        }
    }
}
