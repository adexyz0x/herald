//! Payouts. Funds move from reserved to paid before the transfer and are moved back if it fails,
//! so a failed transfer never loses money or double-pays.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, NearToken, Promise};

use crate::events::emit;
use crate::types::*;
use crate::{Contract, ContractExt, GAS_FOR_PAYOUT_CALLBACK};

impl Contract {
    /// Moves the amount from reserved to paid and sends it. The caller must already have
    /// reserved the amount on the campaign.
    pub(crate) fn start_payout(&mut self, mut sub: Submission) -> Promise {
        let mut campaign = self.campaign(sub.campaign_id);
        campaign.reserved = U128(campaign.reserved.0 - sub.amount.0);
        campaign.paid = U128(campaign.paid.0 + sub.amount.0);
        sub.status = SubmissionStatus::Paid;
        sub.paid_at_ms = Some(Self::now_ms());
        let (creator, amount, id) = (sub.creator.clone(), sub.amount.0, sub.id);
        self.save_campaign(campaign);
        self.save_submission(sub);

        Promise::new(creator)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PAYOUT_CALLBACK)
                    .on_payout(id),
            )
    }
}

#[near]
impl Contract {
    /// Settles a payout once the transfer has run. Returns whether the creator was paid.
    #[private]
    pub fn on_payout(&mut self, submission_id: u64) -> bool {
        // A plain transfer returns no data, so a zero-length bound is enough.
        let succeeded = env::promise_result_checked(0, 0).is_ok();
        let mut sub = self.submission(submission_id);
        let mut campaign = self.campaign(sub.campaign_id);
        let amount = sub.amount.0;

        if succeeded {
            campaign.payout_count += 1;
            self.payout_count += 1;
            self.total_paid += amount;
            let mut rep = self.reputation_of(&sub.dao, &sub.creator);
            rep.points += 1;
            rep.paid_count += 1;
            rep.total_earned = U128(rep.total_earned.0 + amount);
            rep.paid_submissions.push(submission_id);
            let (points, banned) = (rep.points, rep.banned);
            self.save_reputation(&sub.dao, &sub.creator, rep);
            self.save_campaign(campaign);
            emit(
                "payout_paid",
                json!({
                    "submission_id": submission_id,
                    "campaign_id": sub.campaign_id,
                    "creator": sub.creator,
                    "amount": sub.amount,
                }),
            );
            emit(
                "reputation_changed",
                json!({ "dao": sub.dao, "account_id": sub.creator, "points": points, "banned": banned }),
            );
        } else {
            campaign.paid = U128(campaign.paid.0 - amount);
            campaign.reserved = U128(campaign.reserved.0 + amount);
            sub.status = SubmissionStatus::Approved;
            sub.paid_at_ms = None;
            self.save_campaign(campaign);
            emit(
                "payout_failed",
                json!({ "submission_id": submission_id, "creator": sub.creator, "amount": sub.amount }),
            );
            self.save_submission(sub);
        }
        succeeded
    }
}
