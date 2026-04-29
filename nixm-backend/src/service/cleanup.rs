use crate::state::AppState;
use std::time::Instant;

pub async fn remove_dead_connections(state: AppState) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

        let now = Instant::now();
        let mut conns = state.connections.write().await;

        conns.retain(|(uid, did), ws| {
            let age = now.duration_since(ws.last_keepalive).as_secs();
            let is_expired = age >= 90;
            if is_expired {
                println!("Cleaned up: user {uid} device {did}");
            }
            !is_expired
        });
    }
}
