use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AccessClaims {
    pub sub: String, // ID пользователя
    pub exp: usize,  // Время истечения
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshClaims {
    pub sub: String, // ID пользователя
    pub exp: usize,  // Время истечения
    pub jti: String, // Уникальный ID токена (для отзыва)
}

#[derive(Debug, Serialize)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64, // Время жизни access‑токена в секундах
}

#[derive(Clone)]
pub struct TokenService {
    pub(crate) secret: Vec<u8>,
}

impl TokenService {
    pub fn new(secret: Vec<u8>) -> Self {
        Self { secret }
    }

    pub fn issue_pair(&self, user_id: &str) -> Result<TokenPair, jsonwebtoken::errors::Error> {
        let access_token = self.generate_access_token(user_id)?;
        let refresh_token = self.generate_refresh_token(user_id)?;

        Ok(TokenPair {
            access_token,
            refresh_token,
            expires_in: 15 * 60,
        })
    }

    pub fn refresh_access_token(
        &self,
        refresh_token: &str,
    ) -> Result<TokenPair, jsonwebtoken::errors::Error> {
        match self.decode_refresh_token(refresh_token) {
            Ok(token_data) => {
                // Если refresh‑токен валиден, выдаём новую пару
                let user_id = &token_data.sub;
                self.issue_pair(user_id)
            }
            Err(e) => Err(e),
        }
    }

    pub fn decode_access_token(
        &self,
        token: &str,
    ) -> Result<AccessClaims, jsonwebtoken::errors::Error> {
        let token_data = decode::<AccessClaims>(
            token,
            &DecodingKey::from_secret(&self.secret),
            &Validation::default(),
        )?;
        Ok(token_data.claims)
    }

    pub fn decode_refresh_token(
        &self,
        token: &str,
    ) -> Result<RefreshClaims, jsonwebtoken::errors::Error> {
        let token_data = decode::<RefreshClaims>(
            token,
            &DecodingKey::from_secret(&self.secret),
            &Validation::default(),
        )?;
        Ok(token_data.claims)
    }

    fn generate_access_token(&self, user_id: &str) -> Result<String, jsonwebtoken::errors::Error> {
        let claims = AccessClaims {
            sub: user_id.to_string(),
            exp: (Utc::now() + Duration::minutes(5)).timestamp() as usize,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(&self.secret),
        )
    }

    fn generate_refresh_token(&self, user_id: &str) -> Result<String, jsonwebtoken::errors::Error> {
        let claims = RefreshClaims {
            sub: user_id.to_string(),
            exp: (Utc::now() + Duration::days(7)).timestamp() as usize,
            jti: uuid::Uuid::new_v4().to_string(),
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(&self.secret),
        )
    }
}
