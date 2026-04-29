use sqlx::PgPool;
use std::env;

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    dotenvy::dotenv().ok();

    let db_user = env::var("DB_USER").expect("DB_USER must be set");
    let db_password = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let db_port = env::var("DB_PORT").expect("DB_PORT must be set");

    let db_url = format!(
        "postgres://{}:{}@localhost:{}",
        db_user, db_password, db_port
    );
    let pool = PgPool::connect(&db_url).await?;

    println!("Running database migrations...");
    sqlx::migrate!("./migrations").run(&pool).await?;
    println!("Migrations completed successfully!");

    Ok(())
}
