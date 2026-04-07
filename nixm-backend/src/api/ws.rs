// // api/ws.rs
// use axum::extract::ws::{WebSocket, WebSocketUpgrade};
// use axum::extract::State;
// use axum::http::Response;
// use tokio::sync::mpsc;
// use crate::state::AppState;
//
// pub async fn ws_handler(
//     ws: WebSocketUpgrade,
//     State(state): State<AppState>,
//     // + извлечь user_id из JWT (через query param или header)
// ) -> Response {
//     ws.on_upgrade(move |socket| handle_socket(socket, state, user_id))
// }
//
// async fn handle_socket(socket: WebSocket, state: AppState, user_id: i32) {
//     let (tx, rx) = mpsc::unbounded_channel();
//
//     // Регистрируем соединение
//     state.connections.write().await.insert(user_id, tx);
//
//     // ... читаем/пишем сообщения
//
//     // При дисконнекте — удаляем
//     state.connections.write().await.remove(&user_id);
// }