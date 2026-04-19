use sqlx::PgPool;

pub async fn save(pool: &PgPool, from_id: i64, to_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO chat_requests (from_id, to_id)
        VALUES ($1, $2)
        ON CONFLICT (from_id, to_id) DO NOTHING
        "#,
        from_id,
        to_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete(pool: &PgPool, from_id: i64, to_id: i64) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "DELETE FROM chat_requests WHERE from_id = $1 AND to_id = $2",
        from_id,
        to_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_pending_for_user(pool: &PgPool, to_id: i64) -> Result<Vec<i64>, sqlx::Error> {
    sqlx::query_scalar!("SELECT from_id FROM chat_requests WHERE to_id = $1", to_id,)
        .fetch_all(pool)
        .await
}
