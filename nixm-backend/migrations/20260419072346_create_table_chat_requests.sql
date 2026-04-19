CREATE TABLE chat_requests
(
    id         BIGSERIAL PRIMARY KEY,
    from_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_id      BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_chat_request UNIQUE (from_id, to_id)
);

CREATE INDEX idx_chat_requests_to_id ON chat_requests (to_id);