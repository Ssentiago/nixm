use sqlx::PgPool;
use crate::models::refresh_token::RefreshToken;

pub async fn save(
    pool: &PgPool,
    token: &RefreshToken,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO refresh_tokens (id, user_id, token_jti, issued_at, expires_at, revoked, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        token.id,
        token.user_id,
        token.token_jti,
        token.issued_at,
        token.expires_at,
        token.revoked,
        token.ip_address,
        token.user_agent
    )
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn is_valid(
    pool: &PgPool,
    user_id: &i32,
    jti: &str,
) -> Result<bool, sqlx::Error> {
    let exists = sqlx::query_scalar!(
        r#"SELECT EXISTS(
            SELECT 1 FROM refresh_tokens
            WHERE user_id = $1 AND token_jti = $2 AND revoked = FALSE
            AND expires_at > CURRENT_TIMESTAMP
        )"#,
        user_id,
        jti
    )
        .fetch_one(pool)
        .await?
        .unwrap_or(false);

    Ok(exists)
}