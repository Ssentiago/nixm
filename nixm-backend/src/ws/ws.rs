use crate::db;
use crate::db::messages::MessagePayload;
use crate::state::{AppState, WsSender};
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;
use rmp_serde;
use serde::Deserialize;
use std::time::Instant;
use tokio::sync::mpsc;

const MSG_AUTH: u8 = 0;
const MSG_DATA: u8 = 1;
const MSG_KEEPALIVE: u8 = 2;
const MSG_CHAT_REQUEST: u8 = 3;
const MSG_CHAT_ACCEPTED: u8 = 4;
const MSG_CHAT_DECLINED: u8 = 5;

#[derive(Deserialize)]
struct DevicePayload {
    device_id: String,
    iv: Vec<u8>,
    ciphertext: Vec<u8>,
}

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let (user_id, device_id) = match authenticate(&mut socket, &state).await {
        Some(ids) => ids,
        None => return,
    };

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    register_connection(&state, user_id, &device_id, tx).await;

    if !deliver_offline(&mut socket, &state, user_id, &device_id).await {
        cleanup(&state, user_id, &device_id).await;
        return;
    }

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
                        let ok = match bytes[0] {
                            MSG_KEEPALIVE => {
                                handle_keepalive(&mut socket, &state, user_id, &device_id).await
                            }
                            MSG_DATA => {
                                handle_data(&mut socket, &state, user_id, &device_id, &bytes).await
                            }
                            MSG_CHAT_REQUEST => {
                                handle_chat_request(&mut socket, &state, user_id, &bytes).await
                            }
                            MSG_CHAT_ACCEPTED => {
                                handle_chat_accepted(&state, user_id, &bytes).await
                            }
                            MSG_CHAT_DECLINED => {
                                handle_chat_declined(&state, user_id, &bytes).await
                            }
                            _ => true,
                        };
                        if !ok { break; }
                    }
                    Ok(Message::Close(_)) | Err(_) => break,
                    _ => {}
                }
            }
            else => break,
        }
    }

    cleanup(&state, user_id, &device_id).await;
}

async fn authenticate(socket: &mut WebSocket, state: &AppState) -> Option<(i64, String)> {
    let auth_result = tokio::time::timeout(std::time::Duration::from_secs(5), socket.recv()).await;

    match auth_result {
        Ok(Some(Ok(Message::Binary(bytes)))) => {
            if bytes.is_empty() || bytes[0] != MSG_AUTH {
                let _ = socket
                    .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                    .await;
                return None;
            }

            let parsed: (String, String) = match rmp_serde::from_slice(&bytes[1..]) {
                Ok(t) => t,
                Err(e) => {
                    println!("msgpack decode error: {e}");
                    let _ = socket
                        .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                        .await;
                    return None;
                }
            };

            let (token, device_id) = parsed;

            match state.token_service.decode_access_token(&token) {
                Ok(claims) => match claims.sub.parse::<i64>() {
                    Ok(user_id) => {
                        let ack_payload = rmp_serde::to_vec("ACK").unwrap();
                        let ack = build_packet(MSG_AUTH, &ack_payload);
                        if socket.send(Message::Binary(ack.into())).await.is_err() {
                            return None;
                        }
                        println!("WS authed: user_id={user_id}, device_id={device_id}");
                        Some((user_id, device_id))
                    }
                    Err(_) => {
                        let _ = socket
                            .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                            .await;
                        None
                    }
                },
                Err(e) => {
                    println!("token invalid: {e}");
                    let _ = socket
                        .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                        .await;
                    None
                }
            }
        }
        Err(_) => {
            println!("auth timeout");
            let _ = socket
                .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                .await;
            None
        }
        _ => None,
    }
}

async fn register_connection(
    state: &AppState,
    user_id: i64,
    device_id: &str,
    tx: mpsc::UnboundedSender<Vec<u8>>,
) {
    let mut conns = state.connections.write().await;
    conns.insert(
        (user_id, device_id.to_string()),
        WsSender {
            sender: tx,
            last_keepalive: Instant::now(),
        },
    );
}

async fn cleanup(state: &AppState, user_id: i64, device_id: &str) {
    state
        .connections
        .write()
        .await
        .remove(&(user_id, device_id.to_string()));
    println!("WS disconnected: user_id={user_id}");
}

async fn deliver_offline(
    socket: &mut WebSocket,
    state: &AppState,
    user_id: i64,
    device_id: &str,
) -> bool {
    match db::messages::get_pending_payloads(&state.pool, device_id).await {
        Ok(pending) if !pending.is_empty() => {
            let mut delivered_ids = Vec::with_capacity(pending.len());
            for p in &pending {
                let packet = build_data_packet(
                    user_id,
                    p.timestamp,
                    &p.message_uuid,
                    device_id,
                    &p.iv,
                    &p.ciphertext,
                );
                if socket.send(Message::Binary(packet.into())).await.is_err() {
                    return false;
                }
                delivered_ids.push(p.payload_id);
            }
            if let Err(e) = db::messages::mark_delivered(&state.pool, &delivered_ids).await {
                println!("mark_delivered error: {e}");
            }
        }
        Err(e) => println!("get_pending_payloads error: {e}"),
        _ => {}
    }

    match db::chat_requests::get_pending_for_user(&state.pool, user_id).await {
        Ok(pending) if !pending.is_empty() => {
            for from_id in pending {
                let user = match db::users::find_by_id(&state.pool, from_id).await {
                    Ok(Some(u)) => u,
                    _ => continue,
                };
                let payload = rmp_serde::to_vec(&serde_json::json!({
                    "from": from_id,
                    "username": user.username,
                    "avatar_url": user.avatar_url,
                }))
                .unwrap();
                let packet = build_packet(MSG_CHAT_REQUEST, &payload);
                if socket.send(Message::Binary(packet.into())).await.is_err() {
                    return false;
                }
            }
        }
        Err(e) => println!("get_pending_chat_requests error: {e}"),
        _ => {}
    }

    true
}

async fn handle_keepalive(
    socket: &mut WebSocket,
    state: &AppState,
    user_id: i64,
    device_id: &str,
) -> bool {
    let pong = build_packet(MSG_KEEPALIVE, &rmp_serde::to_vec("PONG").unwrap());
    if socket.send(Message::Binary(pong.into())).await.is_err() {
        return false;
    }

    let mut conns = state.connections.write().await;
    if let Some(ws) = conns.get_mut(&(user_id, device_id.to_string())) {
        ws.last_keepalive = Instant::now();
        println!("keepalive updated: user_id={user_id}");
    } else {
        return false;
    }

    true
}

async fn handle_data(
    socket: &mut WebSocket,
    state: &AppState,
    user_id: i64,
    device_id: &str,
    bytes: &[u8],
) -> bool {
    const HEADER_LEN: usize = 1 + 8 + 8 + 36;
    if bytes.len() < HEADER_LEN + 1 {
        println!("data packet too short");
        return true;
    }

    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());
    let timestamp = i64::from_be_bytes(bytes[9..17].try_into().unwrap());
    let message_uuid = match std::str::from_utf8(&bytes[17..53]) {
        Ok(s) => s.to_string(),
        Err(_) => {
            println!("invalid message_uuid");
            return true;
        }
    };

    let payloads: Vec<DevicePayload> = match rmp_serde::from_slice(&bytes[53..]) {
        Ok(p) => p,
        Err(e) => {
            println!("payloads decode error: {e}");
            return true;
        }
    };

    println!(
        "MSG_DATA from={user_id} to={to} uuid={message_uuid} payloads={}",
        payloads.len()
    );

    let db_payloads: Vec<MessagePayload> = payloads
        .iter()
        .map(|p| MessagePayload {
            device_id: p.device_id.clone(),
            iv: p.iv.clone(),
            ciphertext: p.ciphertext.clone(),
        })
        .collect();

    if let Err(e) = db::messages::save_message(
        &state.pool,
        &message_uuid,
        user_id,
        to,
        timestamp,
        &db_payloads,
    )
    .await
    {
        println!("save_message error: {e}");
        return true;
    }

    let conns = state.connections.read().await;
    for p in &payloads {
        let key = (to, p.device_id.clone());
        if let Some(ws_sender) = conns.get(&key) {
            let packet = build_data_packet(
                user_id,
                timestamp,
                &message_uuid,
                device_id,
                &p.iv,
                &p.ciphertext,
            );
            if ws_sender.sender.send(packet).is_err() {
                println!("send to device {} failed", p.device_id);
            } else {
                let pool = state.pool.clone();
                let uuid = message_uuid.clone();
                let did = p.device_id.clone();
                tokio::spawn(async move {
                    if let Ok(Some(id)) = db::messages::get_payload_id(&pool, &uuid, &did).await {
                        let _ = db::messages::mark_delivered(&pool, &[id]).await;
                    }
                });
            }
        }
    }

    true
}

async fn handle_chat_request(
    socket: &mut WebSocket,
    state: &AppState,
    user_id: i64,
    bytes: &[u8],
) -> bool {
    if bytes.len() < 9 {
        return true;
    }
    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

    if let Err(e) = db::chat_requests::save(&state.pool, user_id, to).await {
        println!("save chat_request error: {e}");
        return true;
    }

    let sender = match db::users::find_by_id(&state.pool, user_id).await {
        Ok(Some(u)) => u,
        _ => return true,
    };

    let payload = rmp_serde::to_vec(&serde_json::json!({
        "from": user_id,
        "username": sender.username,
        "avatar_url": sender.avatar_url,
    }))
    .unwrap();
    let packet = build_packet(MSG_CHAT_REQUEST, &payload);

    let conns = state.connections.read().await;
    for ((uid, _did), ws_sender) in conns.iter() {
        if *uid == to {
            let _ = ws_sender.sender.send(packet.clone());
        }
    }

    let _ = socket;
    true
}

async fn handle_chat_accepted(state: &AppState, user_id: i64, bytes: &[u8]) -> bool {
    if bytes.len() < 9 {
        return true;
    }
    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

    let _ = db::chat_requests::delete(&state.pool, to, user_id).await;

    let packet = build_packet(MSG_CHAT_ACCEPTED, &user_id.to_be_bytes());
    let conns = state.connections.read().await;
    for ((uid, _did), ws_sender) in conns.iter() {
        if *uid == to {
            let _ = ws_sender.sender.send(packet.clone());
        }
    }

    true
}

async fn handle_chat_declined(state: &AppState, user_id: i64, bytes: &[u8]) -> bool {
    if bytes.len() < 9 {
        return true;
    }
    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

    let _ = db::chat_requests::delete(&state.pool, to, user_id).await;

    let packet = build_packet(MSG_CHAT_DECLINED, &user_id.to_be_bytes());
    let conns = state.connections.read().await;
    for ((uid, _did), ws_sender) in conns.iter() {
        if *uid == to {
            let _ = ws_sender.sender.send(packet.clone());
        }
    }

    true
}

fn build_data_packet(
    from: i64,
    timestamp: i64,
    message_uuid: &str,
    sender_device_id: &str,
    iv: &[u8],
    ciphertext: &[u8],
) -> Vec<u8> {
    let sender_did_bytes = sender_device_id.as_bytes();
    let mut packet = Vec::with_capacity(1 + 8 + 8 + 36 + 36 + iv.len() + ciphertext.len());
    packet.push(MSG_DATA);
    packet.extend_from_slice(&from.to_be_bytes());
    packet.extend_from_slice(&timestamp.to_be_bytes());
    packet.extend_from_slice(message_uuid.as_bytes());
    packet.extend_from_slice(sender_did_bytes);
    packet.extend_from_slice(iv);
    packet.extend_from_slice(ciphertext);
    packet
}

fn build_packet(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut packet = Vec::with_capacity(1 + payload.len());
    packet.push(msg_type);
    packet.extend_from_slice(payload);
    packet
}
