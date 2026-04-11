use crate::db;
use crate::middleware::auth::auth_middleware;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Extension, Json, Router, middleware};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct UploadRequest {
    public_key: String,
}

async fn upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Extension(user_id_str): Extension<String>,
    Json(body): Json<UploadRequest>,
) -> impl IntoResponse {
    let device_id = match headers.get("X-Device-ID") {
        Some(val) => match val.to_str() {
            Ok(s) => s.to_string(),
            Err(_) => return StatusCode::BAD_REQUEST.into_response(), // wrong header format
        },
        None => return StatusCode::BAD_REQUEST.into_response(), // no header
    };

    let user_id: i64 = match user_id_str.parse() {
        Ok(id) => id,
        Err(_) => {
            eprintln!("Invalid user_id in token: {}", user_id_str);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let public_key = body.public_key;

    if public_key.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }

    if let Err(e) = db::keys::upload_public_key(&state.pool, user_id, &device_id, &public_key).await
    {
        eprintln!("DB Error uploading key for user: {:?}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR).into_response();
    }

    (StatusCode::OK).into_response()
}

async fn keys(State(state): State<AppState>, Path(user_id): Path<i64>) -> impl IntoResponse {
    return match db::keys::get_public_keys_for_user(&state.pool, user_id).await {
        Ok(keys) => (StatusCode::OK, Json(json!(keys))).into_response(),
        Err(e) => {
            eprintln!("Error when getting public keys for user: {:?}", e);
            (StatusCode::INTERNAL_SERVER_ERROR).into_response()
        }
    };
}

pub fn router() -> Router<AppState> {
    let protected = Router::new()
        .route("/upload", post(upload))
        .route("/keys/user_id", get(keys))
        .layer(middleware::from_fn(auth_middleware));
    Router::new().merge(protected)
}
