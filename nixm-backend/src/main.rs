mod api;
pub mod db;
pub mod middleware;
pub mod models;
pub mod service;
pub mod state;
pub mod ws;

use crate::api::{auth, invite_links, keys, messages, users};
use crate::state::AppState;
use axum::{Router, ServiceExt, routing::get};
use service::cleanup;
use service::tokens::TokenService;
use sqlx::PgPool;
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_governor::{GovernorLayer, governor::GovernorConfigBuilder};
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tracing_subscriber;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let jwt_secret = env::var("JWT_SECRET")
        .expect("JWT_SECRET environment variable must be set")
        .into_bytes();

    let is_dev = std::env::var("DEV").ok().is_some();
    let dev_frontend_dir = "../nixm-frontend/dist";

    tracing_subscriber::fmt::init();

    let db_user = env::var("DB_USER").expect("DB_USER must be set");
    let db_password = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let db_port = env::var("DB_PORT").expect("DB_PORT must be set");
    let db_url = format!(
        "postgres://{}:{}@localhost:{}",
        db_user, db_password, db_port
    );
    let pool = PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Cannot invoke migrations");

    let state = AppState {
        pool,
        token_service: Arc::new(TokenService { secret: jwt_secret }),
        connections: Arc::new(RwLock::new(HashMap::new())),
    };

    let cleanup_state = state.clone();
    tokio::spawn(async move { cleanup::remove_dead_connections(cleanup_state).await });

    let cors = CorsLayer::very_permissive();

    let backend_port = std::env::var("BACKEND_PORT").unwrap_or("3000".to_string());

    let auth_limiter = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(1)
            .burst_size(5)
            .finish()
            .unwrap(),
    );

    let invites_limiter = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(1)
            .burst_size(10)
            .finish()
            .unwrap(),
    );

    let general_limiter = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(10)
            .burst_size(30)
            .finish()
            .unwrap(),
    );

    let mut app = Router::new()
        .nest(
            "/api/auth",
            auth::router(state.clone()).layer(GovernorLayer::new(auth_limiter)),
        )
        .nest(
            "/api/invites",
            invite_links::router(state.clone()).layer(GovernorLayer::new(invites_limiter)),
        )
        .nest(
            "/api/keys",
            keys::router(state.clone()).layer(GovernorLayer::new(general_limiter.clone())),
        )
        .nest(
            "/api/users",
            users::router(state.clone()).layer(GovernorLayer::new(general_limiter.clone())),
        )
        .nest("/api/messages", messages::router(state.clone()))
        .route("/ws", get(ws::ws::ws_handler))
        .with_state(state);

    match is_dev {
        true => {
            println!(
                "LAUNCHING IN DEVELOPMENT ENVIRONMENT. USING ASSETS FROM: {}",
                dev_frontend_dir
            );
            app = app
                .fallback_service(
                    ServeDir::new(&dev_frontend_dir)
                        .fallback(ServeFile::new(format!("{}/index.html", dev_frontend_dir))),
                )
                .nest_service("/avatars", ServeDir::new("./avatars"))
                .layer(cors)
        }
        false => {
            app = app.nest_service("/avatars", ServeDir::new("./avatars"));
            println!("RUNNING IN PRODUCTION ENVIRONMENT. USE NGINX TO SERVE ASSETS...")
        }
    }

    app = app.layer(tower_http::trace::TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", backend_port))
        .await
        .expect("Cannot launch server");

    println!("Listening on 127.0.0.1:{backend_port} over HTTP...");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("Cannot serve app");
}
