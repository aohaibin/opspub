mod commands;
mod database;
mod error;
mod models;
// 远程访问网关骨架：默认不接线，等衍生项目做移动端伴侣时再调用 remote::server::start。
// 声明为 pub 而非 mod —— 它是面向外部（移动端）的 API 骨架，pub 让编译器认可其可达性，
// 从而不误报 dead_code，同时骨架仍参与编译检查、不会悄悄烂掉。
pub mod remote;
mod services;
pub mod shared;
mod state;
mod tray;

use state::AppState;
use tauri::Manager;

/// 供外部 Claude/Codex/Cursor 通过 stdio 启动当前可执行文件时调用。
pub fn run_mcp_stdio(token: String, port: u16) -> Result<(), String> {
    services::mcp::run_stdio_proxy(&token, port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ─── 禁止多开（必须是第一个注册的插件）─────────
        // 锁键 = identifier，第二个实例启动时进程立刻退出，回调在“已运行的实例”里执行：
        // 还原 + 显示（本应用关闭=隐藏到托盘，窗口很可能是隐藏态）+ 抢焦点，把用户带回当前窗口。
        // identifier 已 dev/prod 分流（主 identifier + `.dev` 后缀，见 tauri.conf.dev.json）→
        // dev 与 prod 各自独占一个实例、互不阻塞，可同时各开一个。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // ─── 插件注册 ───────────────────────────────
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                // 开发环境日志更详细，生产环境只记录 Warn 及以上
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Info
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // ─── 应用初始化 ─────────────────────────────
        .setup(|app| {
            // 初始化数据库（存放在应用数据目录）
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // 开发与生产使用同一 app_data_dir，但用不同文件名隔离数据
            // 避免开发环境污染生产环境的真实数据（DB / 同名锁文件等）
            let db_filename = if cfg!(debug_assertions) {
                "dev-app.db"
            } else {
                "app.db"
            };
            let db_path = data_dir.join(db_filename);
            let db_path_str = db_path.to_string_lossy().to_string();

            let db = database::Database::init(&db_path_str)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            log::info!("数据库初始化完成: {}", db_path_str);

            // 注册全局状态
            app.manage(AppState::new(db));

            // MCP HTTP 端点只绑定本机回环地址，应用启动时即准备好给 stdio 适配器转发。
            let mcp_app = app.handle().clone();
            let mcp_state = app.state::<AppState>();
            if let Err(error) = tauri::async_runtime::block_on(
                services::mcp::McpService::start_http(&mcp_state.mcp, mcp_app, None),
            ) {
                // MCP 端点异常不应阻止主界面启动，页面会显示可诊断的错误状态并允许重试。
                log::warn!("MCP HTTP 端点启动失败: {}", error);
            }

            // 初始化系统托盘
            tray::setup_tray(app)?;
            log::info!("系统托盘初始化完成");

            // 开发模式下给窗口标题加 [DEV] 后缀，避免与生产版本混淆
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(current_title) = window.title() {
                    let _ = window.set_title(&format!("{} [DEV]", current_title));
                }
            }

            Ok(())
        })
        // ─── Command 注册 ───────────────────────────
        .invoke_handler(tauri::generate_handler![
            // 系统模块
            commands::system::greet,
            commands::system::get_system_info,
            // 配置模块
            commands::config::get_all_config,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::delete_config,
            // 服务器模块
            commands::server::list_servers,
            commands::server::list_saved_ssh_credentials,
            commands::server::save_ssh_credentials,
            commands::server::delete_ssh_credentials,
            commands::server::add_server,
            commands::server::update_server,
            commands::server::delete_server,
            commands::server::batch_delete_servers,
            commands::server::batch_update_server_policy,
            commands::server::batch_add_server_tags,
            commands::server::set_server_favorite,
            commands::server::test_server_connectivity,
            commands::server::test_server_ssh,
            commands::server::import_ssh_config,
            // 交互式终端模块
            commands::terminal::open_terminal_session,
            commands::terminal::list_terminal_sessions,
            commands::terminal::close_all_terminal_sessions,
            commands::terminal::write_terminal_session,
            commands::terminal::resize_terminal_session,
            commands::terminal::close_terminal_session,
            // SFTP 文件传输模块
            commands::sftp::open_sftp_session,
            commands::sftp::list_sftp_sessions,
            commands::sftp::close_sftp_session,
            commands::sftp::close_all_sftp_sessions,
            commands::sftp::sftp_list,
            commands::sftp::sftp_upload,
            commands::sftp::sftp_download,
            commands::sftp::sftp_mkdir,
            commands::sftp::sftp_rename,
            commands::sftp::sftp_copy,
            commands::sftp::sftp_chmod,
            commands::sftp::sftp_delete,
            commands::sftp::sftp_archive,
            commands::workbench::execute_workbench_command,
            commands::batch::execute_batch_target,
            commands::copilot::copilot_chat,
            commands::copilot::get_ai_lock,
            commands::copilot::set_ai_lock,
            commands::copilot::list_ai_approvals,
            commands::copilot::reject_ai_approval,
            commands::copilot::approve_ai_approval,
            // 部署与发布模块
            commands::deployment::list_deploy_targets,
            commands::deployment::save_deploy_target,
            commands::deployment::delete_deploy_target,
            commands::deployment::list_deployment_history,
            commands::deployment::deploy_target,
            commands::deployment::rollback_deploy_target,
            // 数据库连接与查询
            commands::database::list_database_connections,
            commands::database::add_database_connection,
            commands::database::delete_database_connection,
            commands::database::test_database_connection,
            commands::database::test_saved_database_connection,
            commands::database::execute_database_query,
            commands::database::list_sql_databases,
            commands::database::list_database_tables,
            commands::database::list_redis_keys,
            commands::database::get_redis_value,
            commands::database::list_mongo_collections,
            commands::database::query_mongo_collection,
            // 审核日志模块
            commands::audit::get_audit_logs,
            commands::audit::add_audit_log,
            // MCP 接入中心
            commands::mcp::get_mcp_status,
            commands::mcp::test_mcp_connection,
            commands::mcp::start_mcp_http,
            commands::mcp::stop_mcp_http,
            commands::mcp::list_mcp_tokens,
            commands::mcp::create_mcp_token,
            commands::mcp::revoke_mcp_token,
            commands::mcp::get_mcp_client_config,
            commands::mcp::inject_mcp_client_config,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                let state = app.state::<AppState>();
                let _ = tauri::async_runtime::block_on(services::mcp::McpService::stop_http(
                    &state.mcp,
                ));
                state.terminals.close_all();
                state.sftps.close_all();
            }
        });
}
