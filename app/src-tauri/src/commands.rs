use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Holding {
    pub date: String,
    pub etf_code: String,
    pub stock_code: String,
    pub name: String,
    pub weight: f64,
    pub quantity: i64,
    pub price: f64,
}

#[tauri::command]
pub async fn run_sidecar(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    sidecar_exe: String,
    args: Vec<String>,
) -> Result<String, String> {
    let command = app.shell().sidecar(sidecar_exe).map_err(|e| e.to_string())?;
    let command = command.args(args);
    
    let output = command.output().await.map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Sidecar failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse JSON
    let holdings: Vec<Holding> = serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Insert into DB
    for holding in &holdings {
        sqlx::query(
            "INSERT OR REPLACE INTO holdings (date, etf_code, stock_code, stock_name, weight, quantity, price) 
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&holding.date)
        .bind(&holding.etf_code)
        .bind(&holding.stock_code)
        .bind(&holding.name)
        .bind(holding.weight)
        .bind(holding.quantity)
        .bind(holding.price)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(format!("Successfully imported {} holdings", holdings.len())) // stdout might be multiline or not, strictly parsing JSON array
}

#[tauri::command]
pub async fn get_holdings(
    state: tauri::State<'_, AppState>,
    etf_code: String,
    _start_date: Option<String>,
    _end_date: Option<String>,
) -> Result<Vec<Holding>, String> {
    // Basic runtime query without macro checks
    let rows = sqlx::query_as::<_, Holding>(
        r#"
        SELECT date, etf_code, stock_code, stock_name as "name", weight, quantity, price
        FROM holdings
        WHERE etf_code = ?
        ORDER BY date ASC
        "#
    )
    .bind(etf_code)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub added: Vec<Holding>,
    pub removed: Vec<Holding>,
    pub changed: Vec<Holding>,
}

#[tauri::command]
pub async fn analyze_changes(
    state: tauri::State<'_, AppState>,
    etf_code: String,
    date1: String,
    date2: String,
) -> Result<AnalysisResult, String> {
    // added: present in date2, not in date1
    let added = sqlx::query_as::<_, Holding>(
        r#"
        SELECT date, etf_code, stock_code, stock_name as name, weight, quantity, price FROM holdings h2
        WHERE h2.etf_code = ? AND h2.date = ?
        AND h2.stock_code NOT IN (
            SELECT stock_code FROM holdings h1 
            WHERE h1.etf_code = ? AND h1.date = ?
        )
        "#
    )
    .bind(&etf_code).bind(&date2)
    .bind(&etf_code).bind(&date1)
    .fetch_all(&state.db).await.map_err(|e| e.to_string())?;

    // removed: present in date1, not in date2
    let removed = sqlx::query_as::<_, Holding>(
        r#"
        SELECT date, etf_code, stock_code, stock_name as name, weight, quantity, price FROM holdings h1
        WHERE h1.etf_code = ? AND h1.date = ?
        AND h1.stock_code NOT IN (
            SELECT stock_code FROM holdings h2 
            WHERE h2.etf_code = ? AND h2.date = ?
        )
        "#
    )
    .bind(&etf_code).bind(&date1)
    .bind(&etf_code).bind(&date2)
    .fetch_all(&state.db).await.map_err(|e| e.to_string())?;

    // changed: different weights
    let changed = sqlx::query_as::<_, Holding>(
        r#"
        SELECT h2.date, h2.etf_code, h2.stock_code, h2.stock_name as name, h2.weight, h2.quantity, h2.price 
        FROM holdings h2
        JOIN holdings h1 ON h2.stock_code = h1.stock_code 
            AND h1.etf_code = h2.etf_code
        WHERE h2.etf_code = ? AND h2.date = ? AND h1.date = ?
        AND h2.weight != h1.weight
        ORDER BY ABS(h2.weight - h1.weight) DESC
        "#
    )
    .bind(&etf_code).bind(&date2).bind(&date1)
    .fetch_all(&state.db).await.map_err(|e| e.to_string())?;

    Ok(AnalysisResult { added, removed, changed })
}

#[tauri::command]
pub async fn analyze_trends(
    _state: tauri::State<'_, AppState>,
    _etf_code: String,
    _days: i64,
) -> Result<Vec<String>, String> {
    // Trend analysis stub
    Ok(vec![])
}

#[tauri::command]
pub async fn get_favorite_etfs(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    use sqlx::Row;
    let rows = sqlx::query(
        "SELECT code FROM etfs WHERE is_favorite = 1"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|r| r.get("code")).collect())
}

#[tauri::command]
pub async fn toggle_etf_favorite(
    state: tauri::State<'_, AppState>,
    etf_code: String,
) -> Result<bool, String> {
    use sqlx::Row;
    // Check current state
    let rec = sqlx::query(
        "SELECT is_favorite FROM etfs WHERE code = ?"
    )
    .bind(&etf_code)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let current: bool = rec.map(|r| r.get("is_favorite")).unwrap_or(false);
    let new_val = !current;

    sqlx::query(
        "UPDATE etfs SET is_favorite = ? WHERE code = ?"
    )
    .bind(new_val)
    .bind(etf_code)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(new_val)
}


