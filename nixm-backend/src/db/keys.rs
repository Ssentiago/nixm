use sqlx::PgPool;

#[derive(Debug, serde::Serialize)]
pub struct PublicKeyRecord {
    pub device_id: String,
    pub public_key: String,
}

pub async fn upload_public_key(
    pool: &PgPool,
    user_id: i64,
    device_id: &str,
    public_key: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
    INSERT INTO user_public_keys (user_id, public_key, device_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, device_id)
        DO UPDATE SET
            public_key = EXCLUDED.public_key,
            created_at = NOW(),
            is_active = TRUE
"#,
        user_id,
        public_key,
        device_id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_public_keys_for_user(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<PublicKeyRecord>, sqlx::Error> {
    let records = sqlx::query!(
        r#"
        SELECT device_id, public_key
        FROM user_public_keys
        WHERE user_id = $1 AND is_active = TRUE
        "#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    let keys = records
        .into_iter()
        .map(|r| PublicKeyRecord {
            device_id: r.device_id,
            public_key: r.public_key,
        })
        .collect();
    Ok(keys)
}
