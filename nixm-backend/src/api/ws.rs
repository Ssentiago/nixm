use axum::extract::ws::{WebSocket, WebSocketUpgrade, Message};
use axum::extract::{State, Query};
use axum::response::{Response, IntoResponse};
use axum::http::StatusCode;
use tokio::sync::mpsc;
use serde::Deserialize;
use jsonwebtoken::{decode, DecodingKey, Validation};
use crate::state::AppState;
use crate::tokens::{decode_access_token, AccessClaims};
use std::env;


#[derive(Deserialize)]
pub struct WsQuery {
    token: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<WsQuery>,
) -> impl IntoResponse {
    println!("ws_handler called, token: {}", &query.token[..20]);

    let claims = match decode_access_token(&query.token) {
        Ok(c) => c,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };

    let user_id: i64 = match claims.sub.parse() {
        Ok(id) => id,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };

    ws.on_upgrade(move |socket| handle_socket(socket, state, user_id))
}

async fn handle_socket(mut socket: WebSocket, state: AppState, user_id: i64) {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    state.connections.write().await.insert(user_id, tx);

    loop {
        tokio::select! {
            // Входящее сообщение из канала — шлём в WS
            Some(msg) = rx.recv() => {
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
            Some(result) = socket.recv() => {
                match result {
                    Ok(Message::Text(text)) => {
                        println!("from {user_id}: {text}");
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    state.connections.write().await.remove(&user_id);
}