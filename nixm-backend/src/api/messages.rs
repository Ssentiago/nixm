// routes/messages.rs
use crate::db;
use crate::middleware::auth::auth_middleware;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{Extension, Router, middleware, routing::get};
use base64::{Engine, engine::general_purpose};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct HistoryParams {
    before: Option<i64>,
    limit: Option<i64>,
    device_id: String,
}

async fn get_history(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Path(peer_id): Path<i64>,
    Query(params): Query<HistoryParams>,
) -> impl IntoResponse {
    let my_id: i64 = match user_id.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let limit = params.limit.unwrap_or(50).min(100);

    match db::messages::get_history(
        &state.pool,
        my_id,
        peer_id,
        &params.device_id,
        params.before,
        limit,
    )
    .await
    {
        Ok(rows) => {
            let messages: Vec<_> = rows
                .iter()
                .map(|r| {
                    json!({
                        "messageId": r.message_uuid,
                        "from": r.from_user_id.to_string(),
                        "to": r.to_user_id.to_string(),
                        "timestamp": r.timestamp,
                        "iv": general_purpose::STANDARD.encode(&r.iv),
                        "ciphertext": general_purpose::STANDARD.encode(&r.ciphertext),
                    })
                })
                .collect();

            (StatusCode::OK, axum::Json(json!({ "messages": messages }))).into_response()
        }
        Err(e) => {
            eprintln!("get_history error: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/{peer_id}", get(get_history))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
}
