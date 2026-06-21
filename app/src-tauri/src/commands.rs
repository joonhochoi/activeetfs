use crate::AppState;
use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub async fn check_holdings_exist(
    state: tauri::State<'_, AppState>,
    etf_code: String,
    date: String,
) -> Result<bool, String> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM holdings WHERE etf_code = ? AND date = ?"
    )
    .bind(&etf_code)
    .bind(&date)
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.0 > 0)
}

#[tauri::command]
pub async fn get_latest_date_before(
    state: tauri::State<'_, AppState>,
    etf_code: String,
    before_date: String,
) -> Result<Option<String>, String> {
    use sqlx::Row;
    let row = sqlx::query(
        "SELECT date FROM holdings WHERE etf_code = ? AND date < ? ORDER BY date DESC LIMIT 1"
    )
    .bind(&etf_code)
    .bind(&before_date)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|r| r.get::<String, _>("date")))
}

#[tauri::command]
pub async fn get_holdings_by_date(
    state: tauri::State<'_, AppState>,
    etf_code: String,
    date: String,
) -> Result<Vec<Holding>, String> {
    let rows = sqlx::query_as::<_, Holding>(
        r#"
        SELECT date, etf_code, stock_code, stock_name as "name", weight, quantity, price
        FROM holdings
        WHERE etf_code = ? AND date = ?
        "#
    )
    .bind(etf_code)
    .bind(date)
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EtfSetting {
    pub code: String,
    pub is_enabled: bool,
    pub data_count: i64,
    pub last_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EtfToggle {
    pub code: String,
    pub is_enabled: bool,
}

#[tauri::command]
pub async fn get_etf_enabled_list(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<EtfSetting>, String> {
    let rows = sqlx::query_as::<_, EtfSetting>(
        r#"
        SELECT e.code,
               COALESCE(e.is_enabled, 1) as is_enabled,
               COALESCE(h.cnt, 0) as data_count,
               h.last_date as last_date
        FROM etfs e
        LEFT JOIN (
            SELECT etf_code, COUNT(DISTINCT date) as cnt, MAX(date) as last_date
            FROM holdings
            GROUP BY etf_code
        ) h ON h.etf_code = e.code
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub async fn save_etf_enabled_list(
    state: tauri::State<'_, AppState>,
    settings: Vec<EtfToggle>,
) -> Result<(), String> {
    for s in &settings {
        sqlx::query("UPDATE etfs SET is_enabled = ? WHERE code = ?")
            .bind(s.is_enabled)
            .bind(&s.code)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
    }
    // 변경 알림은 프론트엔드의 BroadcastChannel('etf-settings')로 처리한다(SelectEtfsWindow → Sidebar).
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddEtfResult {
    pub status: String, // "added" | "exists" | "error"
    pub etf_name: Option<String>,
    pub message: String,
}

#[tauri::command]
pub async fn add_etf_from_url(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<AddEtfResult, String> {
    let info = match crate::fetch::fetch_etf_info_from_url(&url).await {
        Ok(i) => i,
        Err(e) => return Ok(AddEtfResult {
            status: "error".to_string(),
            etf_name: None,
            message: e.to_string(),
        }),
    };

    let existing: Option<String> = sqlx::query_scalar("SELECT name FROM etfs WHERE code = ?")
        .bind(&info.code)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(name) = existing {
        return Ok(AddEtfResult {
            status: "exists".to_string(),
            etf_name: Some(name.clone()),
            message: "목록에 이미 존재하는 ETF입니다.".to_string(),
        });
    }

    sqlx::query(
        "INSERT INTO etfs (code, manager_id, name, etf_id, is_user_added, is_enabled) VALUES (?, ?, ?, ?, 1, 1)"
    )
    .bind(&info.code)
    .bind(&info.manager_id)
    .bind(&info.name)
    .bind(&info.etf_id)
    .execute(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(AddEtfResult {
        status: "added".to_string(),
        etf_name: Some(info.name.clone()),
        message: format!("[{}] 이(가) 추가되었습니다.", info.name),
    })
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct UserEtf {
    pub code: String,
    pub name: String,
    pub manager_id: String,
    pub etf_id: String,
}

#[tauri::command]
pub async fn get_user_added_etfs(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<UserEtf>, String> {
    let rows = sqlx::query_as::<_, UserEtf>(
        "SELECT code, name, manager_id, COALESCE(etf_id, '') as etf_id FROM etfs WHERE is_user_added = 1"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub async fn remove_user_etf(
    state: tauri::State<'_, AppState>,
    code: String,
) -> Result<(), String> {
    // 안전장치: 사용자 추가 ETF(is_user_added = 1)만 삭제 허용. 카탈로그 ETF는 보호한다.
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;

    // 보유 종목 데이터 먼저 정리(고아 레코드 방지)
    sqlx::query("DELETE FROM holdings WHERE etf_code = ?")
        .bind(&code)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let result = sqlx::query("DELETE FROM etfs WHERE code = ? AND is_user_added = 1")
        .bind(&code)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if result.rows_affected() == 0 {
        // 사용자 추가 ETF가 아니거나 존재하지 않음 → 롤백
        tx.rollback().await.map_err(|e| e.to_string())?;
        return Err("삭제할 수 없는 ETF입니다. (사용자 추가 ETF만 삭제 가능)".to_string());
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── 데이터 백업/복원 ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct EtfBackupRow {
    pub code: String,
    pub manager_id: String,
    pub name: String,
    pub etf_id: String,
    pub is_favorite: bool,
    pub is_enabled: bool,
    pub is_user_added: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct HoldingBackupRow {
    pub date: String,
    pub etf_code: String,
    pub stock_code: String,
    pub stock_name: Option<String>,
    pub weight: Option<f64>,
    pub quantity: Option<i64>,
    pub price: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupFile {
    pub format: String,        // "activeetfs-backup"
    pub version: u32,          // 스키마 버전
    pub app_version: String,
    pub exported_at: String,
    pub etfs: Vec<EtfBackupRow>,
    pub holdings: Vec<HoldingBackupRow>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub etf_count: usize,
    pub holding_count: usize,
    pub message: String,
}

// 전체 DB(사용자 ETF 상태 + 보유 종목)를 gzip 압축 JSON으로 내보낸다.
#[tauri::command]
pub async fn export_database(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<BackupResult, String> {
    use std::io::Write;
    use flate2::{write::GzEncoder, Compression};

    let etfs = sqlx::query_as::<_, EtfBackupRow>(
        "SELECT code, manager_id, name, COALESCE(etf_id,'') as etf_id, \
         COALESCE(is_favorite,0) as is_favorite, COALESCE(is_enabled,1) as is_enabled, \
         COALESCE(is_user_added,0) as is_user_added FROM etfs",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let holdings = sqlx::query_as::<_, HoldingBackupRow>(
        "SELECT date, etf_code, stock_code, stock_name, weight, quantity, price FROM holdings",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    let etf_count = etfs.len();
    let holding_count = holdings.len();

    let backup = BackupFile {
        format: "activeetfs-backup".to_string(),
        version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        etfs,
        holdings,
    };

    let json = serde_json::to_vec(&backup).map_err(|e| e.to_string())?;

    // .gz 확장자면 gzip 압축, 아니면 평문 JSON으로 저장.
    let bytes = if path.to_lowercase().ends_with(".json") {
        json
    } else {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&json).map_err(|e| e.to_string())?;
        encoder.finish().map_err(|e| e.to_string())?
    };

    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    Ok(BackupResult {
        etf_count,
        holding_count,
        message: format!("ETF {}개, 보유 데이터 {}건을 내보냈습니다.", etf_count, holding_count),
    })
}

// 백업 파일을 읽어 복원한다.
// mode: "overwrite" = 가져온 데이터로 덮어쓰기, "fill" = 비어 있는 (ETF, 날짜)만 채우기
#[tauri::command]
pub async fn import_database(
    state: tauri::State<'_, AppState>,
    path: String,
    mode: String,
) -> Result<BackupResult, String> {
    use std::io::Read;
    use flate2::read::GzDecoder;

    let raw = std::fs::read(&path).map_err(|e| e.to_string())?;

    // gzip 매직바이트(0x1f 0x8b)면 압축 해제, 아니면 평문 JSON으로 간주.
    let json_bytes = if raw.len() >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
        let mut decoder = GzDecoder::new(&raw[..]);
        let mut buf = Vec::new();
        decoder.read_to_end(&mut buf).map_err(|e| format!("압축 해제 실패: {}", e))?;
        buf
    } else {
        raw
    };

    let backup: BackupFile = serde_json::from_slice(&json_bytes)
        .map_err(|e| format!("백업 파일 형식이 올바르지 않습니다: {}", e))?;
    if backup.format != "activeetfs-backup" {
        return Err("Active ETFs 백업 파일이 아닙니다.".to_string());
    }

    let overwrite = mode == "overwrite";

    // fill 모드: 현재 DB에 이미 데이터가 있는 (etf_code, date) 조합은 건드리지 않는다.
    use std::collections::HashSet;
    let mut existing_pairs: HashSet<(String, String)> = HashSet::new();
    if !overwrite {
        use sqlx::Row;
        let rows = sqlx::query("SELECT DISTINCT etf_code, date FROM holdings")
            .fetch_all(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        for r in rows {
            existing_pairs.insert((r.get::<String, _>("etf_code"), r.get::<String, _>("date")));
        }
    }

    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;

    // 1) ETF 메타데이터 복원
    let mut etf_count = 0usize;
    for e in &backup.etfs {
        if overwrite {
            // 덮어쓰기: 플래그까지 갱신(카탈로그 ETF 포함). 사용자 추가 ETF는 새로 삽입.
            sqlx::query(
                "INSERT INTO etfs (code, manager_id, name, etf_id, is_favorite, is_enabled, is_user_added) \
                 VALUES (?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(code) DO UPDATE SET manager_id=excluded.manager_id, name=excluded.name, \
                 etf_id=excluded.etf_id, is_favorite=excluded.is_favorite, is_enabled=excluded.is_enabled, \
                 is_user_added=excluded.is_user_added",
            )
            .bind(&e.code).bind(&e.manager_id).bind(&e.name).bind(&e.etf_id)
            .bind(e.is_favorite).bind(e.is_enabled).bind(e.is_user_added)
            .execute(&mut *tx).await.map_err(|err| err.to_string())?;
            etf_count += 1;
        } else {
            // 채우기: 존재하지 않는 ETF만 삽입(기존 플래그/이름은 보존).
            let res = sqlx::query(
                "INSERT OR IGNORE INTO etfs (code, manager_id, name, etf_id, is_favorite, is_enabled, is_user_added) \
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&e.code).bind(&e.manager_id).bind(&e.name).bind(&e.etf_id)
            .bind(e.is_favorite).bind(e.is_enabled).bind(e.is_user_added)
            .execute(&mut *tx).await.map_err(|err| err.to_string())?;
            etf_count += res.rows_affected() as usize;
        }
    }

    // 2) 보유 종목 복원
    let mut holding_count = 0usize;
    for h in &backup.holdings {
        if !overwrite && existing_pairs.contains(&(h.etf_code.clone(), h.date.clone())) {
            continue; // 이미 데이터가 있는 (ETF, 날짜)는 건너뜀
        }
        sqlx::query(
            "INSERT OR REPLACE INTO holdings (date, etf_code, stock_code, stock_name, weight, quantity, price) \
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&h.date).bind(&h.etf_code).bind(&h.stock_code).bind(&h.stock_name)
        .bind(h.weight).bind(h.quantity).bind(h.price)
        .execute(&mut *tx).await.map_err(|err| err.to_string())?;
        holding_count += 1;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let mode_label = if overwrite { "덮어쓰기" } else { "빈 날짜 채우기" };
    Ok(BackupResult {
        etf_count,
        holding_count,
        message: format!(
            "복원 완료({}): ETF {}개, 보유 데이터 {}건 반영.",
            mode_label, etf_count, holding_count
        ),
    })
}

#[tauri::command]
pub fn get_changelog() -> String {
    include_str!("../../../CHANGELOG.md").to_string()
}

#[tauri::command]
pub async fn check_and_update_version(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    use sqlx::Row;
    
    // 1. Get current version from Cargo.toml (compile time)
    let current_version = env!("CARGO_PKG_VERSION");
    
    // 2. Read last_version from DB
    let rec = sqlx::query("SELECT value FROM metadata WHERE key = 'last_version'")
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;
        
    let last_version: Option<String> = rec.and_then(|r| r.get::<Option<String>, _>("value"));
    
    // 3. Compare and update
    if last_version.as_deref() != Some(current_version) {
        sqlx::query("INSERT INTO metadata (key, value) VALUES ('last_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(current_version)
            .execute(&state.db)
            .await
            .map_err(|e| e.to_string())?;
        Ok(true) // Version changed or new
    } else {
        Ok(false) // Version identical
    }
}
