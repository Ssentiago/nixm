use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgPool, Row};

#[derive(Serialize)]
pub struct InviteLink {
    pub id: i64,
    pub code: String,
    pub invite_type: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub used: bool,
    pub revoked: bool,
    pub created_at: DateTime<Utc>,
}

pub async fn create(
    pool: &PgPool,
    user_id: i64,
    invite_type: &str,
    expires_in: Option<i64>, // секунды
) -> Result<InviteLink, sqlx::Error> {
    let expires_at = expires_in.map(|seconds| Utc::now() + chrono::Duration::seconds(seconds));

    let row = sqlx::query!(
        r#"
        INSERT INTO user_invite_links (
            user_id,
            code,
            type,
            expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
            id,
            code,
            type as "invite_type",
            expires_at,
            used,
            revoked,
            created_at
        "#,
        user_id,
        nanoid::nanoid!(12), // или свой генератор кода
        invite_type,
        expires_at
    )
    .fetch_one(pool)
    .await?;

    Ok(InviteLink {
        id: row.id,
        code: row.code,
        invite_type: row.invite_type,
        expires_at: row.expires_at,
        used: row.used,
        revoked: row.revoked,
        created_at: row.created_at,
    })
}

pub async fn get_all_for_user(pool: &PgPool, user_id: i64) -> Result<Vec<InviteLink>, sqlx::Error> {
    sqlx::query_as!(
        InviteLink,
        r#"
        SELECT
            id,
            code,
            type as "invite_type",
            expires_at,
            used,
            revoked,
            created_at
        FROM user_invite_links
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
        user_id
    )
    .fetch_all(pool)
    .await
}

pub async fn revoke(pool: &PgPool, user_id: i64, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        UPDATE user_invite_links
        SET revoked = true,
            revoked_at = NOW(),
            expires_at = LEAST(expires_at, NOW())  -- сразу помечаем как истёкшую
        WHERE id = $1
          AND user_id = $2
          AND NOT revoked
        "#,
        id,
        user_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete(pool: &PgPool, user_id: i64, id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        DELETE FROM user_invite_links
        WHERE id = $1 AND user_id = $2
        "#,
        id,
        user_id
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

// Опционально: проверить ссылку при регистрации/приглашении
pub async fn find_by_code(pool: &PgPool, code: &str) -> Result<Option<InviteLink>, sqlx::Error> {
    sqlx::query_as!(
        InviteLink,
        r#"
        SELECT
            id,
            code,
            type as "invite_type",
            expires_at,
            used,
            revoked,
            created_at
        FROM user_invite_links
        WHERE code = $1
          AND NOT revoked
          AND (expires_at IS NULL OR expires_at > NOW())
        "#,
        code
    )
    .fetch_optional(pool)
    .await
}
