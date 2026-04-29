use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Serialize)]
pub struct InviteLink {
    pub id: i64,
    pub user_id: i64,
    pub code: String,
    pub invite_type: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub use_count: Option<i32>,
    pub revoked: bool,
    pub created_at: DateTime<Utc>,
}
