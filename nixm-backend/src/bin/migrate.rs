use sqlx::PgPool;
use std::env;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    dotenvy::dotenv().ok();

    let DB_USER = env::var("DB_USER").expect("DB_USER must be set");
    let DB_PASSWORD = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let DB_PORT = env::var("DB_PORT").expect("DB_PORT must be set");

    let db_url = format!(
        "postgres://{}:{}@localhost:{}",
        DB_USER, DB_PASSWORD, DB_PORT
    );
    let pool = PgPool::connect(&db_url).await?;

    println!("Running database migrations...");
    sqlx::migrate!("./migrations").run(&pool).await?;
    println!("Migrations completed successfully!");

    Ok(())
}
