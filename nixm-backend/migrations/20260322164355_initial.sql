CREATE TABLE IF NOT EXISTS users
(
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    bio           VARCHAR(160),
    avatar_url    TEXT
);

INSERT INTO users (id, username, password_hash)
VALUES (0, 'system', '');
SELECT setval('users_id_seq', 1, false); -- следующий будет 1


