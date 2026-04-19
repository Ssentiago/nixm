CREATE TABLE chat_invites
(
    id         BIGSERIAL PRIMARY KEY,
    from_id    BIGINT      NOT NULL REFERENCES users (id),
    to_id      BIGINT      NOT NULL REFERENCES users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_invite UNIQUE (from_id, to_id)
);