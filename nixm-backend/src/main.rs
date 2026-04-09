mod api;
pub mod db;
pub mod middleware;
pub mod models;
pub mod state;
pub mod tokens;

use std::collections::HashMap;
use std::env;
use std::env::VarError;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};

use crate::api::{auth, keys, user, ws};
use crate::state::AppState;
use axum::{Router, routing::get};
use sqlx::PgPool;
use tokio::sync::RwLock;
use tracing_subscriber;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let dev_frontend_dir = std::env::var("DEV_FRONTEND_DIR");

    let static_dir = match dev_frontend_dir {
        Ok(dir) => dir,
        Err(_) => "./dist".to_string(),
    };

    println!("USING ASSETS AT: {}", static_dir);

    tracing_subscriber::fmt::init();

    let DB_USER = env::var("DB_USER").expect("DB_USER must be set");
    let DB_PASSWORD = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let DB_PORT = env::var("DB_PORT").expect("DB_PORT must be set");

    let db_url = format!(
        "postgres://{}:{}@localhost:{}",
        DB_USER, DB_PASSWORD, DB_PORT
    );

    let pool = PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let state = AppState {
        db: pool,
        connections: Arc::new(RwLock::new(HashMap::new())),
    };

    let backend_port = std::env::var("BACKEND_PORT").unwrap_or("3000".to_string());

    let app: Router = Router::new()
        .nest("/api/auth", auth::router())
        .nest("/api/user", user::router())
        .nest("/api/keys", keys::router())
        .route("/ws", get(ws::ws_handler))
        .fallback_service(
            ServeDir::new(&static_dir)
                .fallback(ServeFile::new(format!("{}/index.html", static_dir))),
        )
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http());

    println!("listening to {backend_port}...");
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", backend_port))
        .await
        .unwrap();
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
