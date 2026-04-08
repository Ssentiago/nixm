use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use sqlx::PgPool;

// Каждый юзер = канал для отправки сообщений в его WS
type UserId = i64;
type WsSender = mpsc::UnboundedSender<String>;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub connections: Arc<RwLock<HashMap<UserId, WsSender>>>,
}