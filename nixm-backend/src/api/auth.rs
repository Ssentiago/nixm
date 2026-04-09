use crate::db;
use crate::state::AppState;
use crate::tokens::{RefreshClaims, decode_refresh_token};
use axum::http::{HeaderMap, StatusCode};
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json, Router, extract::State, middleware, routing::post};
use axum_extra::extract::CookieJar;
use jsonwebtoken::{DecodingKey, Validation, decode};
use jsonwebtoken::{EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::middleware::auth::auth_middleware;
use crate::models::refresh_token::RefreshToken;
use crate::tokens::{issue_tokens, refresh_access_token};
use axum::extract::ConnectInfo;
use axum::http::header::USER_AGENT;
use axum::routing::get;
use chrono::TimeZone;
use once_cell::sync::OnceCell;
use std::env;
use std::net::SocketAddr;

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

async fn sign_up(
    State(state): State<AppState>,
    Json(body): Json<RegistrationRequest>,
) -> impl IntoResponse {
    let username = body.username;
    let password = body.password;

    // 1. Проверка существования
    let existing_user = match db::users::find_by_username(&state.db, &username).await {
        Ok(user) => user,
        Err(e) => {
            eprintln!("DB Error (find): {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if existing_user.is_some() {
        return (StatusCode::CONFLICT, "Username taken").into_response();
    }

    // 2. Хэширование
    let hash = match bcrypt::hash(&password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Bcrypt Error: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // 3. Создание пользователя
    match db::users::create_user(&state.db, &username, &hash).await {
        Ok(_) => (),
        Err(e) => {
            eprintln!("DB Error (create): {:?}", e); // <-- Вот тут ты увидишь реальную ошибку
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    StatusCode::CREATED.into_response()
}

#[derive(Deserialize)]
struct SignInRequest {
    username: String,
    password: String,
}

async fn sign_in(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<SignInRequest>,
) -> impl IntoResponse {
    // 1. Поиск пользователя
    let user = match db::users::find_by_username(&state.db, &body.username).await {
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

    // 2. Проверка пароля
    let verified = match bcrypt::verify(&body.password, &user.password_hash) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Bcrypt error: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if !verified {
        return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
    }

    // 3. Генерация токенов
    let token_pair = match issue_tokens(&user.id.to_string()) {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("Token generation error: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // 4. Декодирование refresh токена для получения JTI
    let refresh_claim = match decode_refresh_token(&token_pair.refresh_token) {
        Ok(claim) => claim,
        Err(e) => {
            eprintln!("Refresh token decode error: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    // 5. Сбор данных для БД
    let user_agent = headers
        .get(USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown")
        .to_string();

    let ip_address = addr.ip().to_string();

    let refresh_token_obj = RefreshToken {
        id: None,
        token_jti: refresh_claim.jti,
        expires_at: chrono::Utc
            .timestamp_opt(refresh_claim.exp as i64, 0)
            .unwrap(),
        user_id: user.id,
        revoked: false,
        issued_at: chrono::Utc::now(),
        ip_address: Some(ip_address),
        user_agent: Some(user_agent),
    };

    // 6. Сохранение в БД
    if let Err(e) = db::refresh_tokens::save(&state.db, &refresh_token_obj).await {
        eprintln!("Save refresh token error: {:?}", e);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // 7. Формирование куки
    let cookie_str = format!(
        "refresh_token={}; HttpOnly; SameSite=Lax; Path=/api/auth/refresh; Max-Age=604800",
        token_pair.refresh_token
    );

    let cookie_header = match HeaderValue::from_str(&cookie_str) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Cookie header error: {:?}", e);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    (
        StatusCode::OK,
        [(header::SET_COOKIE, cookie_header)],
        Json(json!({
            "access_token": token_pair.access_token,
            "expires_in": token_pair.expires_in,
            "user": {
                "id": user.id,
                "username": user.username
            }
        })),
    )
        .into_response()
}

async fn logout(State(state): State<AppState>, jar: CookieJar) -> impl IntoResponse {
    let refresh_token = match jar.get("refresh_token") {
        Some(c) => c.value().to_string(),
        None => return StatusCode::OK.into_response(), // Куки нет — считаем успешным выходом
    };

    if let Ok(token_data) = decode::<RefreshClaims>(
        &refresh_token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    ) {
        let user_id: i64 = match token_data.claims.sub.parse() {
            Ok(id) => id,
            Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
        let jti = &token_data.claims.jti;

        let _ = db::refresh_tokens::revoke(&state.db, user_id, jti).await;
    }

    let cookie = "refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

    (
        StatusCode::OK,
        [(header::SET_COOKIE, HeaderValue::from_str(cookie).unwrap())],
    )
        .into_response()
}

async fn me(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
) -> impl IntoResponse {
    println!("called me");
    let user = match db::users::find_by_id(&state.db, &user_id).await {
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

    (
        StatusCode::OK,
        Json(json!({
            "user": {
                "id": user.id,
                "username": user.username
            }
        })),
    )
        .into_response()
}

pub async fn refresh_handler(State(state): State<AppState>, jar: CookieJar) -> Response {
    let refresh_token = match jar.get("refresh_token") {
        Some(c) => c.value().to_string(),
        None => {
            println!("[refresh] no cookie");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    println!("[refresh] token found, decoding...");

    let token_data = match decode::<RefreshClaims>(
        &refresh_token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    ) {
        Ok(data) => data,
        Err(e) => {
            println!("[refresh] decode failed: {e}");
            return StatusCode::UNAUTHORIZED.into_response();
        }
    };

    let user_id: i64 = match token_data.claims.sub.parse() {
        Ok(id) => id,
        Err(e) => {
            println!("[refresh] user_id parse failed: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let jti = &token_data.claims.jti;
    println!("[refresh] user_id={user_id}, jti={jti}");

    match db::refresh_tokens::is_valid(&state.db, &user_id, jti).await {
        Ok(true) => {
            println!("[refresh] token valid in db");
        }
        Ok(false) => {
            println!("[refresh] token NOT valid in db");
            return StatusCode::UNAUTHORIZED.into_response();
        }
        Err(e) => {
            println!("[refresh] db error: {e}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    }

    match issue_tokens(&user_id.to_string()) {
        Ok(pair) => {
            let new_claims = decode_refresh_token(&pair.refresh_token).unwrap();

            let new_token = RefreshToken {
                id: None,
                token_jti: new_claims.jti,
                expires_at: chrono::Utc.timestamp_opt(new_claims.exp as i64, 0).unwrap(),
                user_id,
                revoked: false,
                issued_at: chrono::Utc::now(),
                ip_address: None,
                user_agent: None,
            };

            if let Err(e) = db::refresh_tokens::save(&state.db, &new_token).await {
                println!("[refresh] save failed: {e}");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }

            let cookie = format!(
                "refresh_token={}; HttpOnly; SameSite=Lax; Path=/api/auth/refresh; Max-Age=604800",
                pair.refresh_token
            );
            (
                StatusCode::OK,
                [(header::SET_COOKIE, HeaderValue::from_str(&cookie).unwrap())],
                Json(json!({
                    "access_token": pair.access_token,
                    "expires_in": pair.expires_in
                })),
            )
                .into_response()
        }
        Err(e) => {
            println!("[refresh] issue_tokens failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub fn router() -> Router<AppState> {
    let protected = Router::new()
        .route("/me", get(me))
        .layer(middleware::from_fn(auth_middleware));

    let public = Router::new()
        .route("/register", post(sign_up))
        .route("/login", post(sign_in))
        .route("/logout", post(logout))
        .route("/refresh", post(refresh_handler));

    Router::new().merge(protected).merge(public)
}
