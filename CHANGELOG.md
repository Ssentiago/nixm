# 0.1.0

Initial release of nixm — a self-hosted E2EE messenger.

## Features

- End-to-end encryption via ECDH (P-256) + AES-GCM
- WebSocket-based real-time messaging with custom binary protocol
- Device-bound keypairs stored in IndexedDB
- Invite-link based contact system
- JWT authentication with refresh token rotation
- Self-hosted backend in Rust (Axum + PostgreSQL)