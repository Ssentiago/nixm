use crate::models::user::User;

use sqlx::{Postgres, PgPool};


#[derive(sqlx::FromRow)]
struct UserId {
    id: i64,
}


pub async fn find_by_username(
    pool: &PgPool,
    username: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = $1",
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: &str,
) -> Result<Option<User>, sqlx::Error> {
    let id: i64 = id.parse().unwrap();
    
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, created_at FROM users WHERE id = $1",
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
    let user_id: UserId = sqlx::query_as!(UserId,
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
    username,
    password_hash
)
        .fetch_one(pool)
        .await?;

    Ok(user_id.id)
}
