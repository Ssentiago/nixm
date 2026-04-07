CREATE TABLE IF NOT EXISTS refresh_tokens (
                                id TEXT PRIMARY KEY,
                                user_id INTEGER NOT NULL,
                                token_jti TEXT NOT NULL UNIQUE,
                                issued_at TIMESTAMP WITH TIME ZONE,
                                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                                revoked BOOLEAN DEFAULT FALSE,
                                ip_address TEXT,
                                user_agent TEXT,
                                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(token_jti);
CREATE INDEX idx_refresh_tokens_revoked ON refresh_tokens(revoked);

