mod api;
pub mod db;
pub mod models;
pub mod state;
pub mod tokens;

use std::env;
use tower_http::services::ServeDir;

use crate::api::{auth};
use crate::state::AppState;
use axum::{Router, routing::get};
use sqlx::PgPool;
use tracing_subscriber;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let static_dir = if std::env::var("DEBUG").is_ok() {
        std::env::var("FRONTEND_DIR").unwrap()
    } else {
        "./dist".to_string()
    };

    println!("{}", static_dir);


    tracing_subscriber::fmt::init();

    let DB_USER  = env::var("DB_USER").expect("DB_USER must be set");
    let DB_PASSWORD  = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let DB_PORT  = env::var("DB_PORT").expect("DB_PORT must be set");

    let db_url = format!("postgres://{}:{}@localhost:{}", DB_USER, DB_PASSWORD, DB_PORT);

    let pool = PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let state = AppState { db: pool };

    let app: Router = Router::new()
        .nest("/api/auth", auth::router())
        .fallback_service(ServeDir::new(&static_dir))
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http());

    println!("listening to 3000...");
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
