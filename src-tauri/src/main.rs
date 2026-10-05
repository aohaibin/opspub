// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut args = std::env::args().skip(1);
    if args.any(|arg| arg == "--mcp-stdio") {
        let args = std::env::args().collect::<Vec<_>>();
        let token = args
            .windows(2)
            .find(|pair| pair[0] == "--token")
            .map(|pair| pair[1].clone())
            .unwrap_or_default();
        let port = args
            .windows(2)
            .find(|pair| pair[0] == "--port")
            .and_then(|pair| pair[1].parse::<u16>().ok())
            .unwrap_or(18180);
        if let Err(error) = tauri_lib::run_mcp_stdio(token, port) {
            eprintln!("MCP stdio 启动失败：{error}");
            std::process::exit(1);
        }
        return;
    }
    tauri_lib::run()
}
