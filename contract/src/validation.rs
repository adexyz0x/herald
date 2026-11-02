//! Input checks. Limits keep storage bounded and the app's views predictable.

use near_sdk::{require, AccountId};

use crate::types::{Deliverable, Rules};

pub const MAX_TITLE_LEN: usize = 80;
pub const MAX_URL_LEN: usize = 300;
pub const MAX_NOTE_LEN: usize = 280;
pub const MAX_REASON_LEN: usize = 280;
pub const MAX_DELIVERABLE_NAME_LEN: usize = 40;
pub const MAX_RATE_CARD_LINES: usize = 12;
pub const MAX_REVIEWERS: usize = 10;
pub const MIN_CHALLENGE_SEC: u32 = 60;
pub const MAX_CHALLENGE_SEC: u32 = 30 * 24 * 60 * 60;

pub fn title(value: &str) {
    let len = value.trim().chars().count();
    require!(len > 0 && len <= MAX_TITLE_LEN, "Title must be 1-80 characters");
}

pub fn url(value: &str, field: &str) {
    require!(
        value.starts_with("https://") && value.len() <= MAX_URL_LEN && !value.contains(char::is_whitespace),
        format!("{field} must be an https:// link of at most 300 characters")
    );
}

pub fn note(value: &str) {
    require!(value.chars().count() <= MAX_NOTE_LEN, "Note must be at most 280 characters");
}

pub fn reason(value: &str) {
    let len = value.trim().chars().count();
    require!(len > 0 && len <= MAX_REASON_LEN, "Give a reason of 1-280 characters");
}

pub fn rate_card(card: &[Deliverable]) {
    require!(
        !card.is_empty() && card.len() <= MAX_RATE_CARD_LINES,
        "Rate card needs 1-12 lines"
    );
    for line in card {
        let len = line.name.trim().chars().count();
        require!(len > 0 && len <= MAX_DELIVERABLE_NAME_LEN, "Deliverable names must be 1-40 characters");
        require!(line.amount.0 > 0, "Deliverable amounts must be above zero");
    }
}

pub fn reviewers(list: &[AccountId], dao: &AccountId) {
    require!(
        !list.is_empty() && list.len() <= MAX_REVIEWERS,
        "A campaign needs 1-10 reviewers"
    );
    for (i, account) in list.iter().enumerate() {
        require!(account != dao, "The DAO acts through proposals, not as a reviewer");
        require!(!list[..i].contains(account), "Reviewers must be unique");
    }
}

pub fn rules(rules: &Rules) {
    require!(rules.trusted_after >= 1, "trusted_after must be at least 1");
    require!(rules.core_after > rules.trusted_after, "core_after must be above trusted_after");
    require!(
        rules.auto_limit_trusted.0 <= rules.auto_limit_core.0,
        "The Trusted auto limit can't exceed the Core auto limit"
    );
    require!(
        rules.auto_limit_core.0 <= rules.reviewer_limit.0,
        "The Core auto limit can't exceed the reviewer limit"
    );
    require!(rules.reviewer_limit.0 > 0, "reviewer_limit must be above zero");
    require!(
        rules.challenge_period_sec >= MIN_CHALLENGE_SEC && rules.challenge_period_sec <= MAX_CHALLENGE_SEC,
        "The challenge window must be between 1 minute and 30 days"
    );
    require!(
        rules.max_open_per_creator >= 1 && rules.max_open_per_creator <= 20,
        "max_open_per_creator must be 1-20"
    );
    require!(rules.slash_points <= 100, "slash_points must be at most 100");
}
