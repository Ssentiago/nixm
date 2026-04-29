CREATE TABLE IF NOT EXISTS user_public_keys
(
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users ON DELETE CASCADE,
    public_key TEXT   NOT NULL, -- PEM
    device_id  TEXT   NOT NULL,
    is_active  BOOLEAN                  DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_public_keys_user_id ON user_public_keys (user_id) WHERE is_active = TRUE;