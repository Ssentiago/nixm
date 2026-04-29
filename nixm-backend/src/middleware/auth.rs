use crate::state::AppState;
use axum::extract::State;
use axum::{
    extract::Request,
    http::{StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
};

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = state
        .token_service
        .decode_access_token(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    if claims.exp < chrono::Utc::now().timestamp() as usize {
        return Err(StatusCode::UNAUTHORIZED);
    }

    req.extensions_mut().insert(claims.sub);

    Ok(next.run(req).await)
}
