use crate::tokens::decode_access_token;
use axum::response::IntoResponse;
use axum::{
    extract::Request,
    http::{StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
}; // Твой хелпер

pub async fn auth_middleware(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = decode_access_token(token).map_err(|_| StatusCode::UNAUTHORIZED)?;

    if claims.exp < chrono::Utc::now().timestamp() as usize {
        return Err(StatusCode::UNAUTHORIZED);
    }

    req.extensions_mut().insert(claims.sub);

    Ok(next.run(req).await)
}
