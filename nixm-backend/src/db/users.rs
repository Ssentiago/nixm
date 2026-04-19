use crate::models::user::User;

use sqlx::{PgPool, Postgres};

#[derive(sqlx::FromRow)]
struct UserId {
    id: i64,
}

pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at, bio, avatar_url FROM users WHERE username = $1"
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: i64) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at, bio, avatar_url FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn create_user(
    pool: &PgPool,
    username: &str,
    password_hash: &str,
) -> Result<i64, sqlx::Error> {
    let user_id: UserId = sqlx::query_as!(
        UserId,
        "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
        username,
        password_hash
    )
    .fetch_one(pool)
    .await?;

    Ok(user_id.id)
}

pub async fn change_avatar(
    pool: &PgPool,
    user_id: i64,
    avatar_url: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "UPDATE users SET avatar_url = $1 WHERE id = $2",
        avatar_url,
        user_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn change_bio(pool: &PgPool, user_id: i64, bio: &str) -> Result<(), sqlx::Error> {
    sqlx::query!("UPDATE users SET bio = $1 WHERE id = $2", bio, user_id)
        .execute(pool)
        .await?;
    Ok(())
}
