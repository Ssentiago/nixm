use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshToken {
    pub id: Option<String>,
    pub token_jti: String,
    pub user_id: i64,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub revoked: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}
