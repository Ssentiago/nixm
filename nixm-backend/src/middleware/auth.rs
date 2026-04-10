use crate::tokens::decode_access_token;
use axum::response::IntoResponse;
use axum::{
    extract::Request,
    http::{StatusCode, header::AUTHORIZATION},
    middleware::Next,
    response::Response,
}; // Твой хелпер

pub async fn auth_middleware(mut req: Request, next: Next) -> Result<Response, StatusCode> {
    // 1. Достаем заголовок Authorization
    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // 2. Проверяем формат "Bearer <token>"
    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // 3. Декодируем и валидируем токен
    let claims = decode_access_token(token).map_err(|_| StatusCode::UNAUTHORIZED)?;

    if claims.exp < chrono::Utc::now().timestamp() as usize {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // 4. (Опционально) Кладем user_id в extensions запроса,
    // чтобы использовать в хендлерах
    req.extensions_mut().insert(claims.sub); // sub - это user_id из твоих клэймов

    // 5. Пропускаем запрос дальше
    Ok(next.run(req).await)
}
