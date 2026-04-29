use axum::{
    Router,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
};
use hmac::{Hmac, Mac};
use octocrab::Octocrab;
use sha2::Sha256;
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use tracing::{error, info, warn};

type HmacSha256 = Hmac<Sha256>;

struct Config {
    webhook_secret: String,
    repo_owner: String,
    repo_name: String,
    server_path: PathBuf,
    port: String,
}

impl Config {
    fn from_env() -> Self {
        let webhook_secret = std::env::var("WEBHOOK_SECRET").expect("WEBHOOK_SECRET is not set");
        let repo_owner = std::env::var("REPO_OWNER").unwrap_or_else(|_| "Ssentiago".into());
        let repo_name = std::env::var("REPO_NAME").unwrap_or_else(|_| "Nixm".into());
        let server_path =
            PathBuf::from(std::env::var("SERVER_PATH").unwrap_or_else(|_| "../nixm".into()));
        let port = std::env::var("WEBHOOK_PORT").unwrap_or_else(|_| "8000".into());

        Self {
            webhook_secret,
            repo_owner,
            repo_name,
            server_path,
            port,
        }
    }
}

struct AppState {
    config: Config,
    octocrab: Octocrab,
}

fn verify_signature(payload: &[u8], secret: &str, signature_header: &str) -> bool {
    let hex_part = match signature_header.strip_prefix("sha256=") {
        Some(h) => h,
        None => {
            warn!("Signature header missing 'sha256=' prefix");
            return false;
        }
    };

    let expected_bytes = match hex::decode(hex_part) {
        Ok(b) => b,
        Err(e) => {
            warn!("Failed to hex-decode signature: {e}");
            return false;
        }
    };

    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(payload);

    let ok = mac.verify_slice(&expected_bytes).is_ok();
    info!(
        "Signature check: {} (got sha256={}...)",
        if ok { "OK" } else { "FAIL" },
        &hex_part[..12.min(hex_part.len())]
    );
    ok
}

async fn wait_for_assets(
    octocrab: &Octocrab,
    owner: &str,
    repo: &str,
    tag: &str,
    expected: &[&str],
    timeout: Duration,
) -> anyhow::Result<()> {
    let deadline = Instant::now() + timeout;

    loop {
        let release = octocrab
            .repos(owner, repo)
            .releases()
            .get_by_tag(tag)
            .await?;

        let assets: Vec<String> = release.assets.iter().map(|a| a.name.clone()).collect();
        info!("Polling assets: {:?}", assets);

        if expected.iter().all(|name| assets.iter().any(|a| a == name)) {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(anyhow::anyhow!("Timed out waiting for assets"));
        }

        info!("Assets not ready, waiting 5s...");
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

async fn download_asset(url: &str, dest: &Path) -> anyhow::Result<()> {
    let bytes = reqwest::get(url).await?.bytes().await?;
    if bytes.is_empty() {
        return Err(anyhow::anyhow!("Empty response"));
    }
    fs::write(dest, &bytes)?;
    Ok(())
}

fn systemctl(action: &str, service: &str) -> anyhow::Result<()> {
    let status = std::process::Command::new("sudo")
        .args(["systemctl", action, service])
        .status()?;

    if status.success() {
        info!("systemctl {action} {service}: OK");
        Ok(())
    } else {
        Err(anyhow::anyhow!(
            "systemctl {action} {service} exited with {:?}",
            status.code()
        ))
    }
}

#[derive(serde::Deserialize)]
struct WebhookPayload {
    action: String,
    release: ReleaseInfo,
}

#[derive(serde::Deserialize)]
struct ReleaseInfo {
    tag_name: String,
}

async fn deploy(state: Arc<AppState>, tag: String) -> anyhow::Result<()> {
    let temp_dir = std::env::current_exe()?
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Cannot get exe dir"))?
        .join("temp");

    if temp_dir.exists() {
        info!("Removing old temp dir");
        fs::remove_dir_all(&temp_dir)?;
    }
    fs::create_dir_all(&temp_dir)?;

    info!("Waiting for assets...");
    let expected = ["dist.zip", "nixm-backend"];
    wait_for_assets(
        &state.octocrab,
        &state.config.repo_owner,
        &state.config.repo_name,
        &tag,
        &expected,
        Duration::from_secs(120),
    )
    .await?;

    let release = state
        .octocrab
        .repos(&state.config.repo_owner, &state.config.repo_name)
        .releases()
        .get_by_tag(&tag)
        .await?;

    for asset in &release.assets {
        let dest = temp_dir.join(&asset.name);
        let url = asset.browser_download_url.to_string();
        download_asset(&url, &dest).await?;
    }

    let dist = temp_dir.join("dist.zip");
    let binary = temp_dir.join("nixm-backend");

    if !dist.exists() || !binary.exists() {
        return Err(anyhow::anyhow!(
            "Critical assets missing: dist.zip={}, nixm-backend={}",
            dist.exists(),
            binary.exists()
        ));
    }

    info!("Stopping nixm.service...");
    if let Err(e) = systemctl("stop", "nixm.service") {
        warn!("Stop failed (continuing anyway): {e}");
    }

    let server_path = &state.config.server_path;
    if !server_path.exists() {
        return Err(anyhow::anyhow!(
            "Server dir not found: {}",
            server_path.display()
        ));
    }

    let dest_dist = server_path.join("dist");
    let dest_bin = server_path.join("nixm-backend");

    if dest_dist.exists() {
        fs::remove_dir_all(&dest_dist)?;
    }
    if dest_bin.exists() {
        fs::remove_file(&dest_bin)?;
    }

    info!("Extracting dist.zip...");
    let zip_file = fs::File::open(&dist)?;
    let mut archive = zip::ZipArchive::new(zip_file)?;
    archive.extract(&dest_dist)?;
    info!("Extraction done");

    info!("Moving binary...");
    fs::copy(&binary, &dest_bin)?;
    if let Err(e) = fs::set_permissions(&dest_bin, fs::Permissions::from_mode(0o755)) {
        warn!("Failed to chmod binary: {e}");
    }

    fs::remove_dir_all(&temp_dir)?;
    info!("Temp dir cleaned");

    info!("Starting nixm.service...");
    systemctl("start", "nixm.service")?;

    info!("Deployment completed successfully");
    Ok(())
}

async fn release_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    info!("Webhook received, payload size: {} bytes", body.len());

    let signature = match headers
        .get("X-Hub-Signature-256")
        .and_then(|v| v.to_str().ok())
    {
        Some(s) => s.to_owned(),
        None => {
            warn!("No X-Hub-Signature-256 header");
            return StatusCode::FORBIDDEN;
        }
    };

    if !verify_signature(&body, &state.config.webhook_secret, &signature) {
        error!("Signature verification failed");
        return StatusCode::FORBIDDEN;
    }

    let payload: WebhookPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) => {
            error!("JSON parse error: {e}");
            return StatusCode::BAD_REQUEST;
        }
    };

    info!("Action: {}", payload.action);

    if payload.action != "released" {
        info!("Not a 'released' action, ignoring");
        return StatusCode::OK;
    }

    info!("Release tag: {}", payload.release.tag_name);

    tokio::spawn(async move {
        if let Err(e) = deploy(state, payload.release.tag_name).await {
            error!("Deployment failed: {e}");
        }
    });

    StatusCode::OK
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Config::from_env();
    let port = config.port.clone();

    let octocrab = Octocrab::builder()
        .build()
        .expect("Failed to build Octocrab");

    let state = Arc::new(AppState { config, octocrab });

    let app = Router::new()
        .route("/release-webhook", post(release_webhook))
        .with_state(state);

    let bind_addr = format!("127.0.0.1:{port}");
    info!("Starting webhook server on {bind_addr}");

    let listener = tokio::net::TcpListener::bind(&bind_addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app).await.expect("Server error");
}
