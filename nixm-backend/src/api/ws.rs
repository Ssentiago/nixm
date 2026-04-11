use crate::state::AppState;
use crate::tokens::decode_access_token;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::Duration;
use rmp_serde;
use tokio::sync::mpsc;

const MSG_AUTH: u8 = 0;
const MSG_DATA: u8 = 1;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

// TODO составной ключ user_id + device_id
// TODO надо добавить задержку для ожидания авторизации в 5 секунд

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    println!("handle_socket started");

    // 1. Ждём первый пакет — Auth
    let user_id = match socket.recv().await {
        Some(Ok(Message::Binary(bytes))) => {
            println!("got binary: {} bytes, type={}", bytes.len(), bytes[0]);

            if bytes.is_empty() || bytes[0] != MSG_AUTH {
                let _ = socket
                    .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                    .await;
                return;
            }

            let token: String = match rmp_serde::from_slice(&bytes[1..]) {
                Ok(t) => t,
                Err(e) => {
                    println!("msgpack decode error: {e}");
                    let _ = socket
                        .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                        .await;
                    return;
                }
            };

            match decode_access_token(&token) {
                Ok(claims) => match claims.sub.parse::<i64>() {
                    Ok(id) => {
                        println!("token valid, user_id={}", claims.sub);
                        id
                    }
                    Err(e) => {
                        println!("token invalid: {e}");

                        let _ = socket
                            .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                            .await;
                        return;
                    }
                },
                Err(e) => {
                    println!("token invalid: {e}");

                    let _ = socket
                        .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                        .await;
                    return;
                }
            }
        }
        Some(Ok(other)) => {
            println!("got unexpected message type: {:?}", other);
            return;
        }
        None => {
            println!("socket closed before auth");
            return;
        }
        Some(Err(e)) => {
            println!("recv error: {e}");
            return;
        }
    };

    // 2. Отправляем ACK
    // msgpack encode("ACK") = [163, 65, 67, 75]
    let ack_payload = rmp_serde::to_vec("ACK").unwrap();
    let ack = build_packet(MSG_AUTH, &ack_payload);
    if socket.send(Message::Binary(ack.into())).await.is_err() {
        return;
    }

    // 3. Регистрируем соединение
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    state.connections.write().await.insert(user_id, tx);

    println!("WS authed: user_id={user_id}");

    // 4. Основной цикл
    loop {
        tokio::select! {
            Some(bytes) = rx.recv() => {
                if socket.send(Message::Binary(bytes.into())).await.is_err() {
                    break;
                }
            }
            Some(result) = socket.recv() => {
                match result {
                    Ok(Message::Binary(bytes)) => {
                        if bytes.is_empty() { continue; }
                        match bytes[0] {
                            MSG_DATA => {
                                println!("data from {user_id}: {} bytes", bytes.len() - 1);
                                // TODO: роутинг сообщений получателю
                            }
                            _ => {}
                        }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    state.connections.write().await.remove(&user_id);
    println!("WS disconnected: user_id={user_id}");
}

fn build_packet(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut packet = Vec::with_capacity(1 + payload.len());
    packet.push(msg_type);
    packet.extend_from_slice(payload);
    packet
}
