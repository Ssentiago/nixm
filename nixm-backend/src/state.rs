use sqlx::PgPool;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{RwLock, mpsc};

pub struct WsSender {
    pub sender: mpsc::UnboundedSender<Vec<u8>>,
    pub last_keepalive: Instant,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub connections: Arc<RwLock<HashMap<(i64, String), WsSender>>>,
    pub expiry_index: Arc<RwLock<BTreeSet<(Instant, i64, String)>>>,
}
