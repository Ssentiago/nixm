CREATE TABLE IF NOT EXISTS messages
(
    id           BIGSERIAL PRIMARY KEY,
    message_uuid TEXT                     NOT NULL UNIQUE, -- UUID от клиента
    from_user_id BIGINT                   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_user_id   BIGINT                   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    timestamp    BIGINT                   NOT NULL,        -- ms, от клиента

    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_from ON messages (from_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages (to_user_id);
CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages (message_uuid);

-- Зашифрованный payload для каждого устройства получателя
CREATE TABLE IF NOT EXISTS message_payloads
(
    id           BIGSERIAL PRIMARY KEY,
    message_id   BIGINT  NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    device_id    TEXT    NOT NULL, -- UUID девайса получателя
    iv           BYTEA   NOT NULL,
    ciphertext   BYTEA   NOT NULL,

    -- Доставка
    delivered    BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT unique_message_device UNIQUE (message_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_message_payloads_message_id ON message_payloads (message_id);
CREATE INDEX IF NOT EXISTS idx_message_payloads_device_undelivered
    ON message_payloads (device_id, delivered) WHERE delivered = FALSE;