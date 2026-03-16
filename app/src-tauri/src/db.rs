use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Sqlite, SqlitePool};
use std::fs;
use tauri::AppHandle;

pub async fn init_db(_app: &AppHandle) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    // Force Portable Mode: Always use the directory containing the executable
    let mut db_path = std::path::PathBuf::from("activeetf.db"); // Fallback for dev

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            db_path = exe_dir.join("activeetf.db");
        }
    }

    // Ensure directory exists (though parent of exe usually exists)
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    let db_url = format!("sqlite://{}", db_path.to_string_lossy());

    if !Sqlite::database_exists(&db_url).await.unwrap_or(false) {
        Sqlite::create_database(&db_url).await?;
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS managers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS etfs (
            code TEXT PRIMARY KEY,
            manager_id TEXT NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY(manager_id) REFERENCES managers(id)
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS holdings (
            date TEXT NOT NULL,
            etf_code TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            stock_name TEXT,
            weight REAL,
            quantity INTEGER,
            price REAL DEFAULT 0.0,
            PRIMARY KEY (date, etf_code, stock_code),
            FOREIGN KEY(etf_code) REFERENCES etfs(code)
        );",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .execute(&pool)
    .await?;

    // Migration: Attempt to add price column if it doesn't exist (e.g. if table was created before)
    // There is no IF NOT EXISTS for ADD COLUMN in SQLite, so we catch the error.
    let _ = sqlx::query("ALTER TABLE holdings ADD COLUMN price REAL DEFAULT 0.0").execute(&pool).await;
    
    // Migration: Add is_favorite column
    let _ = sqlx::query("ALTER TABLE etfs ADD COLUMN is_favorite BOOLEAN DEFAULT 0").execute(&pool).await;

    // Migration: Add is_enabled column (default 1 = enabled)
    let _ = sqlx::query("ALTER TABLE etfs ADD COLUMN is_enabled BOOLEAN DEFAULT 1").execute(&pool).await;
    let _ = sqlx::query("UPDATE etfs SET is_enabled = 1 WHERE is_enabled IS NULL").execute(&pool).await;

    seed_db(&pool).await?;

    Ok(pool)
}

#[derive(serde::Deserialize)]
struct Config {
    managers: Vec<ManagerConfig>,
}

#[derive(serde::Deserialize)]
struct ManagerConfig {
    id: String,
    name: String,
    #[serde(default)]
    code: Option<String>,
    etfs: Vec<EtfConfig>,
}

#[derive(serde::Deserialize)]
struct EtfConfig {
    code: String,
    name: String,
}

async fn seed_db(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    // Read the config file at compile time from project root
    let config_str = include_str!("../../src/data/activeetfinfos.json");
    let config: Config = serde_json::from_str(config_str)?;

    for manager in config.managers {
        // Managers usually don't have user mutable state, but let's use ON CONFLICT for consistency or keep REPLACE if simplest
        // REPLACE is fine for managers as they only have id, name, code from config
        let code = manager.code.as_deref().unwrap_or(&manager.id);
        sqlx::query("INSERT OR REPLACE INTO managers (id, name, code) VALUES (?, ?, ?)")
            .bind(&manager.id)
            .bind(&manager.name)
            .bind(code)
            .execute(pool)
            .await?;

        for etf in manager.etfs {
            // Use INSERT ... ON CONFLICT to preserve is_favorite
            sqlx::query("INSERT INTO etfs (code, manager_id, name) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET manager_id=excluded.manager_id, name=excluded.name")
                .bind(&etf.code)
                .bind(&manager.id)
                .bind(&etf.name)
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}
