use crate::db;
use crate::middleware::auth::auth_middleware;
use crate::models::user::UserResponse;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::Multipart;
use axum::extract::Path;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Extension, Json, Router, extract::State, middleware, routing::post};
use serde::Deserialize;
use serde_json::json;
use std;
use std::io;
use tokio::fs;
use uuid::Uuid;

async fn get_user(State(state): State<AppState>, Path(user_id): Path<String>) -> impl IntoResponse {
    let uid: i64 = match user_id.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let requested_user = match db::users::find_by_id(&state.pool, uid).await {
        Ok(Some(u)) => u,
        Ok(None) => return (StatusCode::NOT_FOUND, "No user found").into_response(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Cannot get user data: {e}"),
            )
                .into_response();
        }
    };
    (
        StatusCode::OK,
        Json(json!({
            "id": requested_user.id,
            "username": requested_user.username,
        })),
    )
        .into_response()
}

async fn ensure_avatar_dir_exist() -> io::Result<()> {
    fs::create_dir_all("./avatars").await?;
    Ok(())
}

async fn save_avatar_to_disk(avatar: Bytes) -> Result<String, std::io::Error> {
    ensure_avatar_dir_exist().await?;

    let uuid = Uuid::new_v4().to_string();
    let avatar_url = format!("./avatars/{uuid}.webp");
    fs::write(&avatar_url, avatar).await?;

    let public_url = format!("/avatars/{uuid}.webp");

    Ok(public_url)
}

async fn remove_avatar_from_disk(public_avatar_url: &str) -> std::io::Result<()> {
    ensure_avatar_dir_exist().await?;
    fs::remove_file(format!(".{public_avatar_url}")).await
}

async fn upload_avatar(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let uid: i64 = match user_id.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let user_data = match db::users::find_by_id(&state.pool, uid).await {
        Ok(Some(user)) => user,
        Ok(None) => return (StatusCode::BAD_REQUEST).into_response(),
        Err(e) => {
            eprintln!("{e}");
            return (StatusCode::INTERNAL_SERVER_ERROR).into_response();
        }
    };

    match user_data.avatar_url {
        Some(url) => match remove_avatar_from_disk(&url).await {
            Ok(_) => {
                println!("Successfully deleted avatar {} of {}", url, user_data.id);
            }
            Err(e) => {
                eprintln!("An error occurred: {}", e);
            }
        },
        _ => (),
    }

    match db::users::change_avatar(&state.pool, uid, None).await {
        Ok(_) => {
            println!("Successfully removed avatar url from db")
        }
        Err(e) => {
            eprintln!("An error occured when removing avatar from db: {e}")
        }
    }

    while let Some(field) = multipart.next_field().await.unwrap() {
        if field.name() == Some("avatar") {
            let data = match field.bytes().await {
                Ok(b) => b,
                Err(_) => return StatusCode::BAD_REQUEST.into_response(),
            };

            let avatar_url = match save_avatar_to_disk(data).await {
                Ok(url) => url,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };

            if let Err(e) = db::users::change_avatar(&state.pool, uid, Some(&avatar_url)).await {
                eprintln!("change_avatar error: {e}");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }

            return (
                StatusCode::OK,
                [("Cache-Control", "max-age=31536000, immutable")],
                Json(json!({ "avatar_url": avatar_url })),
            )
                .into_response();
        }
    }

    StatusCode::BAD_REQUEST.into_response()
}

#[derive(Deserialize)]
struct UpdateBioRequest {
    bio: String,
}

async fn update_bio(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(body): Json<UpdateBioRequest>,
) -> impl IntoResponse {
    if body.bio.len() > 160 {
        return (StatusCode::BAD_REQUEST, "Bio too long (max 160 chars)").into_response();
    }

    let uid: i64 = match user_id.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    match db::users::change_bio(&state.pool, uid, &body.bio).await {
        Ok(_) => StatusCode::OK.into_response(),
        Err(e) => {
            eprintln!("change_bio error: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
async fn me(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> impl IntoResponse {
    let uid: i64 = match user_id.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let user = match db::users::find_by_id(&state.pool, uid).await {
        Ok(user) => user,
        Err(e) => {
            eprintln!("DB Error finding user: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let user = match user {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response(),
    };

    let response_data = UserResponse::from(user);

    (StatusCode::OK, Json(json!(response_data))).into_response()
}

pub fn router(state: AppState) -> Router<AppState> {
    let protected = Router::new()
        .route("/me", get(me))
        .route("/upload_avatar", post(upload_avatar))
        .route("/update_bio", post(update_bio))
        .route("/{user_id}", get(get_user))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new().merge(protected)
}
