use crate::state::AppState;
use std::time::Instant;

pub async fn main(state: AppState) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

        let mut index = state.expiry_index.write().await;
        let mut conns = state.connections.write().await;

        let now = Instant::now();

        while let Some(entry) = index.first().cloned() {
            let (ts, uid, did) = entry;
            if now.duration_since(ts).as_secs() < 90 {
                break;
            }

            index.pop_first();
            conns.remove(&(uid, did));
            println!("Cleaned up: user {uid}");
        }
    }
}
