use serde::{Deserialize, Serialize};
use chrono::{Utc, Duration};
use jsonwebtoken::{encode, decode, Header, EncodingKey, DecodingKey, Validation};
use once_cell::sync::OnceCell;
use std::env;

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessClaims {
    pub sub: String,      // ID пользователя
    pub exp: usize,       // Время истечения
    pub typ: String,      // Тип токена
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshClaims {
    pub sub: String,      // ID пользователя
    pub exp: usize,       // Время истечения
    pub jti: String,      // Уникальный ID токена (для отзыва)
}




static SECRET: OnceCell<Vec<u8>> = OnceCell::new();

fn get_secret() -> &'static [u8] {
    SECRET.get_or_init(|| {
        env::var("SECRET")
            .expect("SECRET environment variable must be set")
            .into_bytes()
    })
}

/// Генерирует access‑токен (15 минут)
pub fn generate_access_token(user_id: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = AccessClaims {
        sub: user_id.to_string(),
        exp: (Utc::now() + Duration::minutes(15)).timestamp() as usize,
        typ: "access".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_secret()),
    )
}

/// Генерирует refresh‑токен (7 дней)
pub fn generate_refresh_token(user_id: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = RefreshClaims {
        sub: user_id.to_string(),
        exp: (Utc::now() + Duration::days(7)).timestamp() as usize,
        jti: uuid::Uuid::new_v4().to_string(), // Уникальный ID для возможности отзыва
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_secret()),
    )
}


#[derive(Debug, Serialize)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64, // Время жизни access‑токена в секундах
}

pub fn issue_tokens(user_id: &str) -> Result<TokenPair, jsonwebtoken::errors::Error> {
    let access_token = generate_access_token(user_id)?;
    let refresh_token = generate_refresh_token(user_id)?;

    Ok(TokenPair {
        access_token,
        refresh_token,
        expires_in: 15 * 60, // 15 минут в секундах
    })
}

pub fn refresh_access_token(refresh_token: &str) -> Result<TokenPair, jsonwebtoken::errors::Error> {
    // Сначала проверяем refresh‑токен
    match decode::<RefreshClaims>(
        refresh_token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    ) {
        Ok(token_data) => {
            // Если refresh‑токен валиден, выдаём новую пару
            let user_id = &token_data.claims.sub;
            issue_tokens(user_id)
        }
        Err(e) => Err(e),
    }
}

pub fn decode_access_token(token: &str) -> Result<AccessClaims, jsonwebtoken::errors::Error> {
    let token_data = decode::<AccessClaims>(
        token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}

pub fn decode_refresh_token(token: &str) -> Result<RefreshClaims, jsonwebtoken::errors::Error> {
    let token_data = decode::<RefreshClaims>(
        token,
        &DecodingKey::from_secret(get_secret()),
        &Validation::default(),
    )?;
    Ok(token_data.claims)
}