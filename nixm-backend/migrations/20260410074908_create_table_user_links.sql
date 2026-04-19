CREATE TABLE user_invite_links
(
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT             NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    code       VARCHAR(32) UNIQUE NOT NULL,

    type       VARCHAR(10)        NOT NULL CHECK (type IN ('one-time', 'timed')),

    expires_at TIMESTAMPTZ,
    use_count  INTEGER                     DEFAULT 0,

    revoked    BOOLEAN            NOT NULL DEFAULT false,
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_invite_links_user_id ON user_invite_links (user_id);
CREATE INDEX idx_user_invite_links_code ON user_invite_links (code);
CREATE INDEX idx_user_invite_links_expires_at ON user_invite_links (expires_at);
CREATE INDEX idx_user_invite_links_revoked ON user_invite_links (revoked);