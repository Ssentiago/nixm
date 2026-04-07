use crate::db;
use crate::state::AppState;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Json, Router, extract::State, routing::post};
use jsonwebtoken::{EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use axum::http::{header, HeaderValue};
use axum_extra::extract::CookieJar;
use crate::tokens::RefreshClaims;
use jsonwebtoken::{decode, DecodingKey, Validation};

use once_cell::sync::OnceCell;
use std::env;
use crate::tokens::{issue_tokens, refresh_access_token};

static SECRET: OnceCell<Vec<u8>> = OnceCell::new();

fn get_secret() -> &'static [u8] {
    SECRET.get_or_init(|| {
        env::var("SECRET")
            .expect("SECRET environment variable must be set")
            .into_bytes()
    })
}

#[derive(Deserialize)]
struct RegistrationRequest {
    username: String,
    password: String,
}



async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegistrationRequest>,
) -> impl IntoResponse {
    let username = body.username;
    let password = body.password;
    let user = match db::users::find_by_username(&state.db, &username).await {
        Ok(user) => user,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR).into_response(),
    };

    if user.is_some() {
        return (StatusCode::CONFLICT, "username taken").into_response();
    }

    let hash = bcrypt::hash(&password, bcrypt::DEFAULT_COST).unwrap();

    db::users::create_user(&state.db, &username, &hash)
        .await
        .unwrap();

    StatusCode::CREATED.into_response()
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}



async fn login(State(state): State<AppState>, Json(body): Json<LoginRequest>) -> impl IntoResponse {
    let user = match db::users::find_by_username(&state.db, &body.username).await {
        Ok(user) => user,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    match user {
        Some(user) => {
            let verified = match bcrypt::verify(body.password, user.password_hash.as_ref()) {
                Ok(result) => result,
                Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            };

            if !verified {
                return (StatusCode::UNAUTHORIZED, "Invalid username or password").into_response();
            }


            let token_pair = issue_tokens(&user.id.to_string());

            match token_pair {
                Ok(pair) => {
                    let cookie = format!(
                        "refresh_token={}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800",
                        pair.refresh_token
                    );

                    (StatusCode::OK,
                     [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
                     Json(json!({
                        "access_token": pair.access_token,
                        "expires_in": pair.expires_in
                    }))).into_response()
                },
                Err(_) => {
                    StatusCode::INTERNAL_SERVER_ERROR.into_response()
                }
            }


        }
        _ => {
            return StatusCode::UNAUTHORIZED.into_response();
        }
    }
}

pub async fn refresh_handler(
    State(state): State<AppState>,
    jar: CookieJar,
) -> Response {
    let refresh_token = match jar.get("refresh_token") {
        Some(c) => c.value().to_string(),
        None => return StatusCode::UNAUTHORIZED.into_response(),
    };

    // Декодируем чтобы достать user_id и jti для проверки БД
    let token_data = match decode::<RefreshClaims>(
        &refresh_token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    ) {
        Ok(data) => data,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let user_id: i32 = match token_data.claims.sub.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let jti = &token_data.claims.jti;

    // Проверяем что токен не отозван
    match db::refresh_tokens::is_valid(&state.db, &user_id, jti).await {
        Ok(true) => {},
        Ok(false) => return StatusCode::UNAUTHORIZED.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    // Выдаём новую пару
    match issue_tokens(&user_id.to_string()) {
        Ok(pair) => {
            let cookie = format!(
                "refresh_token={}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800",
                pair.refresh_token
            );
            (
                StatusCode::OK,
                [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
                Json(json!({
                    "access_token": pair.access_token,
                    "expires_in": pair.expires_in
                })),
            ).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/refresh", post(refresh_handler))
}
