use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};

type UserId = i64;
pub type WsSender = mpsc::UnboundedSender<Vec<u8>>;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub connections: Arc<RwLock<HashMap<i64, WsSender>>>,
}
