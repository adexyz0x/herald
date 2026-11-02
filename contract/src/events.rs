//! NEP-297 events. Every state change is logged so indexers and the app can rebuild history.

use near_sdk::serde_json::{json, Value};
use near_sdk::env;

pub const STANDARD: &str = "trustladder";
pub const VERSION: &str = "1.0.0";

pub fn emit(event: &str, data: Value) {
    let payload = json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}
