use crate::db;
use crate::db::messages::MessagePayload;
use crate::state::{AppState, WsSender};
use crate::tokens::decode_access_token;
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

// Структура одного payload из msgpack
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
    println!("handle_socket started");

    // 1. Ждём Auth — с таймаутом 5 секунд
    let auth_result = tokio::time::timeout(std::time::Duration::from_secs(5), socket.recv()).await;

    let (user_id, device_id) = match auth_result {
        Ok(Some(Ok(Message::Binary(bytes)))) => {
            if bytes.is_empty() || bytes[0] != MSG_AUTH {
                let _ = socket
                    .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                    .await;
                return;
            }

            // msgpack([token, device_id])
            let parsed: (String, String) = match rmp_serde::from_slice(&bytes[1..]) {
                Ok(t) => t,
                Err(e) => {
                    println!("msgpack decode error: {e}");
                    let _ = socket
                        .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                        .await;
                    return;
                }
            };

            let (token, device_id) = parsed;

            match decode_access_token(&token) {
                Ok(claims) => match claims.sub.parse::<i64>() {
                    Ok(id) => {
                        println!("token valid, user_id={id}, device_id={device_id}");
                        (id, device_id)
                    }
                    Err(_) => {
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
        Ok(_) => return, // неожиданный тип или ошибка
        Err(_) => {
            // таймаут
            println!("auth timeout");
            let _ = socket
                .send(Message::Binary(vec![MSG_AUTH, b'E'].into()))
                .await;
            return;
        }
    };

    // 2. ACK
    let ack_payload = rmp_serde::to_vec("ACK").unwrap();
    let ack = build_packet(MSG_AUTH, &ack_payload);
    if socket.send(Message::Binary(ack.into())).await.is_err() {
        return;
    }

    // 3. Регистрируем соединение — составной ключ user_id + device_id
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    {
        let last_keepalive = Instant::now();
        let mut conns = state.connections.write().await;
        conns.insert(
            (user_id, device_id.clone()),
            WsSender {
                sender: tx,
                last_keepalive: last_keepalive,
            },
        );
    }

    println!("WS authed: user_id={user_id}, device_id={device_id}");

    // 4. Офлайн-доставка — шлём всё что накопилось пока девайс был офлайн
    match db::messages::get_pending_payloads(&state.pool, &device_id).await {
        Ok(pending) if !pending.is_empty() => {
            let mut delivered_ids = Vec::with_capacity(pending.len());

            for p in &pending {
                let packet = build_data_packet(
                    user_id,
                    p.timestamp,
                    &p.message_uuid,
                    &device_id, // device_id отправителя из WS сессии
                    &p.iv,
                    &p.ciphertext,
                );
                if socket.send(Message::Binary(packet.into())).await.is_err() {
                    // Сокет закрылся — не помечаем доставленными
                    state
                        .connections
                        .write()
                        .await
                        .remove(&(user_id, device_id));
                    return;
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
                // Достаём username отправителя
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
                    state
                        .connections
                        .write()
                        .await
                        .remove(&(user_id, device_id));
                    return;
                }
            }
        }
        Err(e) => println!("get_pending_chat_requests error: {e}"),
        _ => {}
    }

    // 5. Основной цикл
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
                                            MSG_KEEPALIVE => {
                                                let pong = build_packet(MSG_KEEPALIVE, &rmp_serde::to_vec("PONG").unwrap());
                                                if socket.send(Message::Binary(pong.into())).await.is_err() {
                                                    break;
                                                }
                                                println!("keepalive: user_id={user_id}");
                                                let now = Instant::now();

                                                let mut conns = state.connections.write().await;

                                                if let Some(ws) = conns.get_mut(&(user_id, device_id.clone())) {

                                                    ws.last_keepalive = now;


                                                    println!("keepalive updated: user_id={user_id}");
                                                } else {
                                                    break;
                                                }



                                            }

                                            MSG_CHAT_REQUEST => {
                    // [0x03][to: i64 8b]
                    if bytes.len() < 9 { continue; }
                    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

                    // Сохраняем в БД
                    if let Err(e) = db::chat_requests::save(&state.pool, user_id, to).await {
                        println!("save chat_request error: {e}");
                        continue;
                    }

                    // Достаём данные отправителя для уведомления
                    let sender = match db::users::find_by_id(&state.pool, user_id).await {
                        Ok(Some(u)) => u,
                        _ => continue,
                    };

                    // Шлём всем онлайн-девайсам получателя
                    let conns = state.connections.read().await;
                    let payload = rmp_serde::to_vec(&serde_json::json!({
                        "from": user_id,
                        "username": sender.username,
                        "avatar_url": sender.avatar_url,
                    })).unwrap();
                    let packet = build_packet(MSG_CHAT_REQUEST, &payload);

                    for ((uid, _did), ws_sender) in conns.iter() {
                        if *uid == to {
                            let _ = ws_sender.sender.send(packet.clone());
                        }
                    }
                }

                MSG_CHAT_ACCEPTED => {
                    if bytes.len() < 9 { continue; }
                    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

                    // Удаляем из pending
                    let _ = db::chat_requests::delete(&state.pool, to, user_id).await;

                    // Уведомляем отправителя запроса
                    let packet = build_packet(MSG_CHAT_ACCEPTED, &user_id.to_be_bytes());
                    let conns = state.connections.read().await;
                    for ((uid, _did), ws_sender) in conns.iter() {
                        if *uid == to {
                            let _ = ws_sender.sender.send(packet.clone());
                        }
                    }
                }

                MSG_CHAT_DECLINED => {
                    if bytes.len() < 9 { continue; }
                    let to = i64::from_be_bytes(bytes[1..9].try_into().unwrap());

                    let _ = db::chat_requests::delete(&state.pool, to, user_id).await;

                    let packet = build_packet(MSG_CHAT_DECLINED, &user_id.to_be_bytes());
                    let conns = state.connections.read().await;
                    for ((uid, _did), ws_sender) in conns.iter() {
                        if *uid == to {
                            let _ = ws_sender.sender.send(packet.clone());
                        }
                    }
                }

                                            MSG_DATA => {
                                                // [0x01][to: i64 8b][timestamp: i64 8b][messageId: 36b][msgpack(payloads)]
                                                const HEADER_LEN: usize = 1 + 8 + 8 + 36;
                                                if bytes.len() < HEADER_LEN + 1 {
                                                    println!("data packet too short");
                                                    continue;
                                                }

                                                let to = i64::from_be_bytes(
                                                    bytes[1..9].try_into().unwrap()
                                                );
                                                let timestamp = i64::from_be_bytes(
                                                    bytes[9..17].try_into().unwrap()
                                                );
                                                let message_uuid = match std::str::from_utf8(&bytes[17..53]) {
                                                    Ok(s) => s.to_string(),
                                                    Err(_) => {
                                                        println!("invalid message_uuid");
                                                        continue;
                                                    }
                                                };

                                                let payloads_raw = &bytes[53..];
                                                let payloads: Vec<DevicePayload> = match rmp_serde::from_slice(payloads_raw) {
                                                    Ok(p) => p,
                                                    Err(e) => {
                                                        println!("payloads decode error: {e}");
                                                        continue;
                                                    }
                                                };

                                                println!(
                                                    "MSG_DATA from={user_id} to={to} uuid={message_uuid} payloads={}",
                                                    payloads.len()
                                                );

                                                // Сохраняем в БД
                                                let db_payloads: Vec<MessagePayload> = payloads.iter().map(|p| MessagePayload {
                                                    device_id: p.device_id.clone(),
                                                    iv: p.iv.clone(),
                                                    ciphertext: p.ciphertext.clone(),
                                                }).collect();

                                                if let Err(e) = db::messages::save_message(
                                                    &state.pool,
                                                    &message_uuid,
                                                    user_id,
                                                    to,
                                                    timestamp,
                                                    &db_payloads,
                                                ).await {
                                                    println!("save_message error: {e}");
                                                    continue;
                                                }

                                                // Роутинг — шлём каждому девайсу получателя если онлайн
                                                let conns = state.connections.read().await;
                                                for p in &payloads {
                                                    let key = (to, p.device_id.clone());
                                                    if let Some(ws_sender) = conns.get(&key) {
        let packet = build_data_packet(
            user_id,
            timestamp,
            &message_uuid,
            &device_id, // device_id отправителя из WS сессии
            &p.iv,
            &p.ciphertext,
        );                                                if ws_sender.sender.send(packet).is_err() {
                                                            println!("send to device {} failed", p.device_id);
                                                        } else {
                                                            // Помечаем доставленным сразу если девайс онлайн
                                                            // (async — fire and forget, не блокируем цикл)
                                                            let pool = state.pool.clone();
                                                            let uuid = message_uuid.clone();
                                                            let did = p.device_id.clone();
                                                            tokio::spawn(async move {
                                                                if let Ok(pending) = db::messages::get_payload_id(&pool, &uuid, &did).await {
                                                                    if let Some(id) = pending {
                                                                        let _ = db::messages::mark_delivered(&pool, &[id]).await;
                                                                    }
                                                                }
                                                            });
                                                        }
                                                    }
                                                    // Если девайса нет в conns — payload уже в БД, доставим при реконнекте
                                                }
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

    state
        .connections
        .write()
        .await
        .remove(&(user_id, device_id));
    println!("WS disconnected: user_id={user_id}");
}

fn build_data_packet(
    from: i64,
    timestamp: i64,
    message_uuid: &str,
    sender_device_id: &str, // добавь
    iv: &[u8],
    ciphertext: &[u8],
) -> Vec<u8> {
    let sender_did_bytes = sender_device_id.as_bytes(); // 36 байт UUID
    let mut packet = Vec::with_capacity(1 + 8 + 8 + 36 + 36 + iv.len() + ciphertext.len());
    packet.push(MSG_DATA);
    packet.extend_from_slice(&from.to_be_bytes());
    packet.extend_from_slice(&timestamp.to_be_bytes());
    packet.extend_from_slice(message_uuid.as_bytes());
    packet.extend_from_slice(sender_did_bytes); // добавь
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
