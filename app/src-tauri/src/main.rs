// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::io::Write;
use std::panic;

fn main() {
    panic::set_hook(Box::new(|panic_info| {
        let mut log_path = std::path::PathBuf::from("crash.log");
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(parent) = exe_path.parent() {
                log_path = parent.join("crash.log");
            }
        }
        
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .unwrap_or_else(|_| std::fs::File::create("crash.log").unwrap());

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
            "Panic occurred at {}:{}:{}: {}",
            location.file(),
            location.line(),
            location.column(),
            msg
        );
    }));

    app_lib::run()
}
