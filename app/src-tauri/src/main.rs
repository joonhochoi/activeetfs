// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::panic;

fn main() {
    let app_data = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string())
    } else {
        // On Mac/Linux, avoid writing to the source directory which triggers tauri dev reloads
        std::env::var("HOME").map(|h| format!("{}/Library/Logs", h)).unwrap_or_else(|_| ".".to_string())
    };
    let log_dir = std::path::PathBuf::from(app_data).join("com.juno.activeetfs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("debug_startup.log");
    
    // Log app start
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = writeln!(f, "[APP START] Executable launched at {:?}", std::time::SystemTime::now());
    }

    panic::set_hook(Box::new(move |panic_info| {
        let mut file = match OpenOptions::new().create(true).append(true).open(&log_path) {
            Ok(f) => f,
            Err(_) => return,
        };

        let payload = panic_info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            *s
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.as_str()
        } else {
            "Unknown panic message"
        };
        
        let location = panic_info.location().unwrap();
        let _ = writeln!(
            file,
            "[PANIC] at {}:{}:{}: {}",
            location.file(),
            location.line(),
            location.column(),
            msg
        );
    }));

    app_lib::run(tauri::generate_context!())
}
