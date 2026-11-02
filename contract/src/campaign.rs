//! Campaign methods. Every one of them is called by the DAO through its own proposals.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, NearToken, Promise};

use crate::events::emit;
use crate::types::*;
use crate::validation;
use crate::{Contract, ContractExt, MIN_CAMPAIGN_BUDGET};

#[near]
impl Contract {
    /// Creates and funds a campaign. The caller becomes the campaign's DAO.
    /// The attached deposit, minus storage, is the budget.
    #[payable]
    pub fn create_campaign(
        &mut self,
        title: String,
        brief_url: String,
        rate_card: Vec<Deliverable>,
        reviewers: Vec<AccountId>,
        rules: Option<Rules>,
    ) -> u64 {
        let dao = env::predecessor_account_id();
        let rules = rules.unwrap_or_default();
        validation::title(&title);
        validation::url(&brief_url, "Brief link");
        validation::rate_card(&rate_card);
        validation::reviewers(&reviewers, &dao);
        validation::rules(&rules);

        let initial_usage = env::storage_usage();
        let id = self.campaign_count;
        self.campaign_count += 1;
        let campaign = Campaign {
            id,
            dao: dao.clone(),
            title: title.trim().to_string(),
            brief_url,
            rate_card,
            reviewers,
            rules,
            budget: U128(0),
            reserved: U128(0),
            paid: U128(0),
            status: CampaignStatus::Active,
            created_at_ms: Self::now_ms(),
            submission_count: 0,
            payout_count: 0,
        };
        self.save_campaign(campaign);
        self.campaign_submissions.insert(id, Vec::new());

        let storage = self.storage_cost_since(initial_usage);
        let attached = env::attached_deposit();
        let budget = attached.saturating_sub(storage);
        require!(
            budget >= MIN_CAMPAIGN_BUDGET,
            "Attach at least 1 NEAR of budget on top of storage"
        );
        let mut campaign = self.campaign(id);
        campaign.budget = U128(budget.as_yoctonear());
        self.save_campaign(campaign.clone());

        emit(
            "campaign_created",
            json!({
                "campaign_id": id,
                "dao": dao,
                "title": campaign.title,
                "budget": campaign.budget,
                "reviewers": campaign.reviewers,
            }),
        );
        id
    }

    /// Adds budget to an active campaign.
    #[payable]
    pub fn top_up(&mut self, campaign_id: u64) {
        let mut campaign = self.campaign(campaign_id);
        Self::assert_dao(&campaign);
        require!(campaign.status == CampaignStatus::Active, "Campaign is closed");
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach the amount to add");
        campaign.budget = U128(campaign.budget.0 + amount);
        self.save_campaign(campaign.clone());
        emit(
            "campaign_updated",
            json!({ "campaign_id": campaign_id, "top_up": U128(amount), "budget": campaign.budget }),
        );
    }

    /// Changes reviewers, rules, rate card or brief. Storage growth is paid from the deposit;
    /// any excess is refunded to the DAO.
    #[payable]
    pub fn update_campaign(
        &mut self,
        campaign_id: u64,
        reviewers: Option<Vec<AccountId>>,
        rules: Option<Rules>,
        rate_card: Option<Vec<Deliverable>>,
        brief_url: Option<String>,
    ) {
        let mut campaign = self.campaign(campaign_id);
        Self::assert_dao(&campaign);
        require!(campaign.status == CampaignStatus::Active, "Campaign is closed");
        let initial_usage = env::storage_usage();

        if let Some(list) = reviewers {
            validation::reviewers(&list, &campaign.dao);
            campaign.reviewers = list;
        }
        if let Some(new_rules) = rules {
            validation::rules(&new_rules);
            campaign.rules = new_rules;
        }
        if let Some(card) = rate_card {
            validation::rate_card(&card);
            campaign.rate_card = card;
        }
        if let Some(url) = brief_url {
            validation::url(&url, "Brief link");
            campaign.brief_url = url;
        }
        self.save_campaign(campaign.clone());
        self.settle_storage(initial_usage, env::attached_deposit(), &campaign.dao);

        emit(
            "campaign_updated",
            json!({
                "campaign_id": campaign_id,
                "reviewers": campaign.reviewers,
                "rules": campaign.rules,
                "rate_card": campaign.rate_card,
                "brief_url": campaign.brief_url,
            }),
        );
    }

    /// Closes a campaign and returns all unreserved budget to the DAO.
    /// Payouts already in their challenge window can still be finalized.
    pub fn close_campaign(&mut self, campaign_id: u64) -> Promise {
        let mut campaign = self.campaign(campaign_id);
        Self::assert_dao(&campaign);
        require!(campaign.status == CampaignStatus::Active, "Campaign is already closed");
        let refund = campaign.available();
        campaign.budget = U128(campaign.reserved.0 + campaign.paid.0);
        campaign.status = CampaignStatus::Closed;
        let dao = campaign.dao.clone();
        self.save_campaign(campaign);
        emit(
            "campaign_closed",
            json!({ "campaign_id": campaign_id, "refunded": U128(refund) }),
        );
        Promise::new(dao).transfer(NearToken::from_yoctonear(refund))
    }

    /// Bans or unbans a creator from every campaign of the calling DAO.
    pub fn dao_set_ban(&mut self, account_id: AccountId, banned: bool) {
        let dao = env::predecessor_account_id();
        let mut rep = self.reputation_of(&dao, &account_id);
        rep.banned = banned;
        let points = rep.points;
        self.save_reputation(&dao, &account_id, rep);
        emit(
            "reputation_changed",
            json!({ "dao": dao, "account_id": account_id, "points": points, "banned": banned }),
        );
    }
}
