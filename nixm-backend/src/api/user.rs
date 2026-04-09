use crate::api::auth::refresh_handler;
use crate::middleware::auth::auth_middleware;
use crate::state::AppState;
use axum::routing::post;
use axum::{Router, middleware};

pub fn router() -> Router<AppState> {
    let protected = Router::new()
        // .route("/me", post(crate::api::auth::me))
        .layer(middleware::from_fn(auth_middleware));

    Router::new().merge(protected)
}
