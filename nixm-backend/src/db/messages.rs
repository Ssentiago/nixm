use sqlx::PgPool;

pub struct MessagePayload {
    pub device_id: String,
    pub iv: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

pub struct MessageRow {
    pub id: i64,
    pub message_uuid: String,
    pub from_user_id: i64,
    pub to_user_id: i64,
    pub timestamp: i64,
}

#[derive(sqlx::FromRow)]
pub struct PendingPayload {
    pub message_uuid: String,
    pub from_user_id: i64,
    pub timestamp: i64,
    pub iv: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub payload_id: i64,
}

pub async fn save_message(
    pool: &PgPool,
    message_uuid: &str,
    from_user_id: i64,
    to_user_id: i64,
    timestamp: i64,
    payloads: &[MessagePayload],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    let message_id: i64 = sqlx::query_scalar!(
        r#"
        INSERT INTO messages (message_uuid, from_user_id, to_user_id, timestamp)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (message_uuid) DO NOTHING
        RETURNING id
        "#,
        message_uuid,
        from_user_id,
        to_user_id,
        timestamp,
    )
    .fetch_one(&mut *tx)
    .await?;

    for p in payloads {
        sqlx::query!(
            r#"
            INSERT INTO message_payloads (message_id, device_id, iv, ciphertext)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (message_id, device_id) DO NOTHING
            "#,
            message_id,
            p.device_id,
            p.iv,
            p.ciphertext,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

/// Забираем все недоставленные payload-ы для конкретного девайса
pub async fn get_pending_payloads(
    pool: &PgPool,
    device_id: &str,
) -> Result<Vec<PendingPayload>, sqlx::Error> {
    sqlx::query_as!(
        PendingPayload,
        r#"
        SELECT
            m.message_uuid,
            m.from_user_id,
            m.timestamp,
            mp.iv,
            mp.ciphertext,
            mp.id as payload_id
        FROM message_payloads mp
        JOIN messages m ON m.id = mp.message_id
        WHERE mp.device_id = $1 AND mp.delivered = FALSE
        ORDER BY m.timestamp ASC
        "#,
        device_id,
    )
    .fetch_all(pool)
    .await
}

pub async fn mark_delivered(pool: &PgPool, payload_ids: &[i64]) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE message_payloads
        SET delivered = TRUE, delivered_at = NOW()
        WHERE id = ANY($1)
        "#,
        payload_ids,
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_payload_id(
    pool: &PgPool,
    message_uuid: &str,
    device_id: &str,
) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        SELECT mp.id
        FROM message_payloads mp
        JOIN messages m ON m.id = mp.message_id
        WHERE m.message_uuid = $1 AND mp.device_id = $2
        "#,
        message_uuid,
        device_id,
    )
    .fetch_optional(pool)
    .await
}
