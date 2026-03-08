// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

mod db;
mod commands;
mod fetch;

use sqlx::SqlitePool;
use tauri::Manager;

pub struct AppState {
    pub db: SqlitePool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let pool = db::init_db(&handle).await.expect("failed to init db");
                handle.manage(AppState { db: pool });
            });
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            commands::run_sidecar, 
            commands::get_holdings,
            commands::analyze_changes,
            commands::analyze_trends,
            commands::get_favorite_etfs,
            commands::toggle_etf_favorite,
            fetch::get_etf_holdings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
