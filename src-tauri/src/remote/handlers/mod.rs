// 业务 handler 模块入口
//
// 在此追加新业务 handler 模块（sessions / upload / pty / asr 等），
// 然后在 server.rs 的 protected Router 上 .route(...) 挂载。

pub mod ping;
pub mod status;
pub mod companion;
