use crate::db;
use crate::middleware::auth::auth_middleware;
use crate::models::user::UserResponse;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Extension, Json, Router, middleware};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Deserialize)]
pub struct CreateInviteRequest {
    pub invite_type: String,     // "one-time" или "timed"
    pub expires_in: Option<i64>, // секунды, только для timed
}

#[derive(Serialize)]
pub struct InviteLinkResponse {
    pub id: i64,
    pub code: String,
    pub invite_type: String,
    pub expires_at: Option<String>,
    pub used: bool,
    pub revoked: bool,
    pub created_at: String,
}

async fn create_invite(
    State(state): State<AppState>,
    Extension(user_id_str): Extension<String>,
    Json(req): Json<CreateInviteRequest>,
) -> impl IntoResponse {
    let user_id: i64 = match user_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id").into_response(),
    };

    if !matches!(req.invite_type.as_str(), "one-time" | "timed") {
        return (StatusCode::BAD_REQUEST, "Invalid invite_type").into_response();
    }

    if req.invite_type == "timed" && req.expires_in.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            "expires_in required for timed invites",
        )
            .into_response();
    }

    match db::invite_links::create(&state.pool, user_id, &req.invite_type, req.expires_in).await {
        Ok(invite) => (StatusCode::CREATED, Json(json!(invite))).into_response(),
        Err(e) => {
            eprintln!("Failed to create invite link for user {}: {:?}", user_id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create invite").into_response()
        }
    }
}

async fn get_user_invites(
    State(state): State<AppState>,
    Extension(user_id_str): Extension<String>,
) -> impl IntoResponse {
    let user_id: i64 = match user_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id").into_response(),
    };

    match db::invite_links::get_all_for_user(&state.pool, user_id).await {
        Ok(invites) => (StatusCode::OK, Json(json!(invites))).into_response(),
        Err(e) => {
            eprintln!("Failed to get invites for user {}: {:?}", user_id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch invites").into_response()
        }
    }
}

async fn revoke_invite(
    State(state): State<AppState>,
    Extension(user_id_str): Extension<String>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let user_id: i64 = match user_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id").into_response(),
    };

    match db::invite_links::revoke(&state.pool, user_id, id).await {
        Ok(true) => (StatusCode::OK, "Revoked").into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            "Invite not found or not owned by you",
        )
            .into_response(),
        Err(e) => {
            eprintln!("Failed to revoke invite {}: {:?}", id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to revoke").into_response()
        }
    }
}

async fn delete_invite(
    State(state): State<AppState>,
    Extension(user_id_str): Extension<String>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let user_id: i64 = match user_id_str.parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id").into_response(),
    };

    match db::invite_links::delete(&state.pool, user_id, id).await {
        Ok(true) => (StatusCode::OK, "Deleted").into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            "Invite not found or not owned by you",
        )
            .into_response(),
        Err(e) => {
            eprintln!("Failed to delete invite {}: {:?}", id, e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete").into_response()
        }
    }
}

async fn resolve(State(state): State<AppState>, Path(code): Path<String>) -> impl IntoResponse {
    let invite = match db::invite_links::resolve(&state.pool, &code).await {
        Ok(Some(i)) => i,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Invalid or expired invite code").into_response();
        }
        Err(e) => {
            eprintln!("resolve invite error: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let user = match db::users::find_by_id(&state.pool, invite.user_id).await {
        Ok(Some(u)) => u,
        Ok(None) => return (StatusCode::NOT_FOUND, "User not found").into_response(),
        Err(e) => {
            eprintln!("find user error: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let response = UserResponse::from(user);
    (StatusCode::OK, Json(json!(response))).into_response()
}

pub fn router(state: AppState) -> Router<AppState> {
    let protected = Router::new()
        .route("/", post(create_invite).get(get_user_invites))
        .route("/resolve/{code}", get(resolve))
        .route("/{id}/revoke", post(revoke_invite))
        .route("/{id}", delete(delete_invite))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new().merge(protected)
}
