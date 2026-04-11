use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{RwLock, mpsc};

type UserId = i64;

pub struct WsSender {
    pub sender: mpsc::UnboundedSender<Vec<u8>>,
    pub last_keepalive: Instant,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub connections: Arc<RwLock<HashMap<UserId, WsSender>>>,
}
