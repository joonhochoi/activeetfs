use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use reqwest::header;

// Holding 구조체 정의 (Go의 Holding과 대응)
// Define the Holding struct to match the Go version
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Holding {
    pub date: String,
    pub etf_code: String,
    pub stock_code: String,
    pub name: String,
    pub weight: f64,
    pub quantity: i64,
    pub price: f64,
}

// KoAct/Kodex API 응답 구조체 (JSON 파싱용)
// Structs for parsing KoAct/Kodex JSON responses
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")] // JSON 키가 camelCase인 경우 자동 매핑
struct KoActResponse {
    pdf: KoActPdf,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KoActPdf {
    list: Vec<KoActAsset>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct KoActAsset {
    sec_nm: String,
    eval_a: String,
    apply_q: String,
    itm_no: String,
    ratio: Option<String>,
}

// PLUS ETF API 응답 구조체
// Structs for parsing PLUS ETF JSON responses
#[derive(Deserialize, Debug)]
struct PlusEtfResponse {
    content: Vec<PlusEtfItem>,
    #[serde(rename = "totalPages")]
    total_pages: i32,
}

#[derive(Deserialize, Debug)]
struct PlusEtfItem {
    // num: int,
    // wk_date: String,
    #[serde(rename = "krJmCd")]
    kr_jm_cd: String,
    #[serde(rename = "jmNm")]
    jm_nm: String,
    amount: f64, // 수량
    ratio: f64,  // 비율
}

// 메인 Tauri 커맨드
// Main Tauri Command
// 이 함수는 프론트엔드에서 직접 호출할 수 있습니다.
// This function can be called directly from the frontend.
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_etf_holdings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: String,
    id: String,
    code: String,
    date: String,
) -> Result<String, String> {
    // 1. 데이터 가져오기
    // 1. Fetch data
    let holdings = match provider.to_lowercase().as_str() {
        "koact" | "kodex" => fetch_koact(&app, &provider, &id, &code, &date).await.map_err(|e| e.to_string())?,
        "rise" => fetch_rise(&id, &code, &date).await.map_err(|e| e.to_string())?,
        "plus" => fetch_plus(&id, &code, &date).await.map_err(|e| e.to_string())?,
        "time" => fetch_time(&id, &code, &date).await.map_err(|e| e.to_string())?,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    // 2. DB에 저장하기
    // 2. Save to DB
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

    Ok(format!("Successfully updated {} holdings", holdings.len()))
}

// KoAct 및 Kodex 데이터 가져오기 (WebView 스크래퍼 사용)
// Fetch KoAct/Kodex data using WebView to naturally bypass Cloudflare
async fn fetch_koact(app: &tauri::AppHandle, provider: &str, id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    let clean_date = date.replace("-", "");
    
    // URL 생성
    let url = if provider.to_lowercase() == "kodex" {
        format!("https://www.samsungfund.com/api/v1/kodex/product-pdf/{}.do?gijunYMD={}", id, clean_date)
    } else {
        format!("https://www.samsungactive.co.kr/api/v1/product/etf-pdf/{}.do?gijunYMD={}", id, clean_date)
    };

    use tauri::{WebviewUrl, WebviewWindowBuilder, Manager};
    use tokio::sync::oneshot;
    use std::sync::{Arc, Mutex};

    let (tx, rx) = oneshot::channel::<String>();
    let tx_shared = Arc::new(Mutex::new(Some(tx)));
    let tx_clone = tx_shared.clone();
    
    let init_script = r#"
        document.addEventListener('DOMContentLoaded', () => {
            // iframe 내부에서는 실행하지 않음 (Cloudflare 위젯 위에 UI가 덮어씌워지는 문제 방지)
            if (window !== window.top) return;

            try {
                const text = document.body.innerText;
                const parsed = JSON.parse(text); // If this succeeds, it's our JSON!
                const payload = encodeURIComponent(text);
                window.location.href = 'http://localhost/scraper-data?json=' + payload;
            } catch(e) {
                // Not JSON -> Cloudflare challenge page!
                // Inject bypass UI at the bottom
                document.body.style.paddingBottom = '70px';
                const bar = document.createElement('div');
                bar.style.position = 'fixed';
                bar.style.bottom = '0';
                bar.style.left = '0';
                bar.style.right = '0';
                bar.style.height = '60px';
                bar.style.padding = '0 20px';
                bar.style.backgroundColor = '#1e293b';
                bar.style.borderTop = '2px solid #3b82f6';
                bar.style.color = '#f8fafc';
                bar.style.display = 'flex';
                bar.style.justifyContent = 'space-between';
                bar.style.alignItems = 'center';
                bar.style.zIndex = '2147483647';
                bar.style.fontFamily = 'sans-serif';
                bar.style.boxShadow = '0 -4px 15px rgba(0,0,0,0.5)';

                const msg = document.createElement('div');
                msg.innerHTML = '<span style="color:#fbbf24; font-size:1.2em; margin-right:8px;">⚠️</span> Cloudflare 보안(로봇 확인)을 통과한 후, 반드시 우측의 <b>완료</b> 버튼을 눌러주세요.';
                msg.style.fontSize = '14px';

                const btn = document.createElement('button');
                btn.innerText = '인증 완료 (계속하기)';
                btn.style.padding = '10px 20px';
                btn.style.backgroundColor = '#10b981';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.style.borderRadius = '6px';
                btn.style.cursor = 'pointer';
                btn.style.fontWeight = 'bold';
                btn.style.fontSize = '14px';
                
                btn.onclick = () => {
                    btn.innerText = '확인 중...';
                    btn.style.backgroundColor = '#64748b';
                    // Reload the page to test if Cloudflare is bypassed.
                    // If bypassed, JSON will load successfully and be captured.
                    window.location.reload(); 
                };

                bar.appendChild(msg);
                bar.appendChild(btn);
                document.body.appendChild(bar);

                // 화면에 창을 보이게 하라고 Rust에 신호 전송
                window.location.href = 'http://localhost/scraper-show';
            }
        });
    "#;

    let app_clone = app.clone();
    let window_label = format!("koact-scraper-{}", chrono::Utc::now().timestamp_millis());
    let window_label_clone = window_label.clone();
    let window_label_show = window_label.clone();

    let _window = WebviewWindowBuilder::new(
        app,
        &window_label,
        WebviewUrl::External(url.parse().unwrap())
    )
    .title(format!("데이터 로딩 및 보안 확인... ({})", provider))
    .inner_size(900.0, 700.0)
    .visible(false) // 백그라운드에서 조용히 실행
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.starts_with("http://localhost/scraper-show") {
            // Cloudflare에 걸렸으니 창을 보여주고 포커싱
            if let Some(w) = app_clone.get_webview_window(&window_label_show) {
                let _ = w.show();
                let _ = w.set_focus();
            }
            return false;
        } else if url_str.starts_with("http://localhost/scraper-data") {
            for (key, value) in nav_url.query_pairs() {
                if key == "json" {
                    if let Some(tx) = tx_clone.lock().unwrap().take() {
                        let _ = tx.send(value.into_owned());
                    }
                    break;
                }
            }
            
            // 창 닫기
            if let Some(w) = app_clone.get_webview_window(&window_label_clone) {
                let _ = w.close();
            }
            return false;
        }
        true
    })
    .build()?;

    // Wait for the result or timeout after 60 seconds
    let json_text = match tokio::time::timeout(tokio::time::Duration::from_secs(60), rx).await {
        Ok(Ok(text)) => text,
        Ok(Err(_)) => return Err("채널 연결이 끊어졌습니다.".into()),
        Err(_) => {
            // Timeout -> clean up window
            if let Some(w) = app.get_webview_window(&window_label) {
                let _ = w.close();
            }
            return Err("60초 타임아웃: 로봇 보안 인증을 제시간에 통과하지 못했습니다.".into());
        }
    };

    let parsed: KoActResponse = serde_json::from_str(&json_text)?;
    
    // 응답 데이터를 Holding 구조체로 변환
    let mut holdings = Vec::new();
    for item in parsed.pdf.list {
        let qty = item.apply_q.replace(",", "").parse::<i64>().unwrap_or(0);
        let price = item.eval_a.replace(",", "").parse::<f64>().unwrap_or(0.0);
        
        let ratio_str = item.ratio.unwrap_or_else(|| "0".to_string());
        let weight = ratio_str.replace(",", "").parse::<f64>().unwrap_or(0.0);

        holdings.push(Holding {
            date: date.to_string(),
            etf_code: code.to_string(),
            stock_code: item.itm_no,
            name: item.sec_nm,
            weight,
            quantity: qty,
            price,
        });
    }

    Ok(holdings)
}

// RISE 데이터 가져오기 (HTML 파싱, POST 요청)
// Fetch RISE data using HTML parsing via POST request
async fn fetch_rise(id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    let url = "https://www.riseetf.co.kr/prod/finder/productViewSearchTabJquery3";
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()?;

    // 폼 데이터 준비
    // Prepare form data
    let params = [("searchDate", date), ("fundCd", id)];

    // 헤더 설정 (필수 헤더들)
    // Set necessary headers
    let mut headers = header::HeaderMap::new();
    headers.insert("Origin", "https://www.riseetf.co.kr".parse().unwrap());
    headers.insert("Referer", format!("https://www.riseetf.co.kr/prod/finderDetail/{}?searchFlag=viewtab3", id).parse().unwrap());
    headers.insert("X-Requested-With", "XMLHttpRequest".parse().unwrap());

    // POST 요청 전송
    let resp = client.post(url)
        .headers(headers)
        .form(&params)
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(format!("Bad status: {}", resp.status()).into());
    }

    // HTML 텍스트 받기 (본문이 <tr> 태그들의 나열임)
    // Get HTML text (response is a list of <tr> tags)
    let html_text = resp.text().await?;
    // goquery는 fragment 파싱이 까다로울 수 있어 테이블로 감쌌으나, scraper는 괜찮을 수 있음.
    // 안전하게 table 태그로 감싸줍니다.
    let wrapped_html = format!("<table>{}</table>", html_text);

    // HTML 파싱
    let document = Html::parse_document(&wrapped_html);
    let tr_selector = Selector::parse("tr").unwrap();
    let td_selector = Selector::parse("th, td").unwrap();

    let mut holdings = Vec::new();

    // 각 행(tr) 순회
    for element in document.select(&tr_selector) {
        let cells: Vec<_> = element.select(&td_selector).collect();
        if cells.len() < 6 {
            continue;
        }

        // 셀 데이터 추출 (Index는 Go 코드 기준)
        // 0: No, 1: Name, 2: Code, 3: Qty, 4: Weight, 5: Price
        let name = cells[1].text().collect::<Vec<_>>().join("").trim().to_string();
        let stock_code = cells[2].text().collect::<Vec<_>>().join("").trim().to_string();

        if name == "종목명" || stock_code.is_empty() {
            continue; // 헤더나 빈 줄 건너뛰기
        }

        let qty_str = cells[3].text().collect::<Vec<_>>().join("").replace(",", "");
        let weight_str = cells[4].text().collect::<Vec<_>>().join("");
        let price_str = cells[5].text().collect::<Vec<_>>().join("").replace(",", "");

        let quantity = qty_str.trim().parse::<i64>().unwrap_or(0);
        let weight = weight_str.trim().parse::<f64>().unwrap_or(0.0);
        let price = price_str.trim().parse::<f64>().unwrap_or(0.0);

        holdings.push(Holding {
            date: date.to_string(),
            etf_code: code.to_string(),
            stock_code,
            name,
            weight,
            quantity,
            price,
        });
    }

    Ok(holdings)
}

// PLUS 데이터 가져오기 (JSON API, 페이지네이션)
// Fetch PLUS data using JSON API with pagination
async fn fetch_plus(id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    let clean_date = date.replace("-", "");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()?;

    let mut holdings = Vec::new();
    let mut page = 0;
    let mut total_pages = 1;

    // 페이지네이션 루프
    while page < total_pages {
        let url = format!(
            "https://www.plusetf.co.kr/api/v1/product/pdf/list?n={}&page={}&d={}&pageSize=10",
            id, page, clean_date
        );

        let resp = client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(format!("Bad status: {} (page {})", resp.status(), page).into());
        }

        let parsed: PlusEtfResponse = resp.json().await?;

        if page == 0 {
            total_pages = parsed.total_pages;
            if total_pages == 0 && !parsed.content.is_empty() {
                total_pages = 1;
            }
        }

        for item in parsed.content {
            holdings.push(Holding {
                date: date.to_string(),
                etf_code: code.to_string(),
                stock_code: item.kr_jm_cd,
                name: item.jm_nm,
                weight: item.ratio,
                quantity: item.amount as i64,
                price: 0.0, // PLUS API에는 가격 정보가 없음
            });
        }

        page += 1;
        
        // 너무 빠른 요청 방지
        if total_pages > 5 {
            std::thread::sleep(Duration::from_millis(200)); 
        } else {
            // async 환경에서는 async sleep이 권장되지만, 여기서는 간단히 blocking sleep 사용해도 무방 (thread::sleep은 전체 스레드를 멈추므로 주의, tokio::time::sleep이 좋음)
            // 여기서는 tokio sleep을 사용하는 것이 좋습니다.
             tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    Ok(holdings)
}

// TIME 데이터 가져오기 (HTML 파싱, GET 요청)
// Fetch TIME data using HTML parsing via GET request
async fn fetch_time(id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    let url = format!("https://timeetf.co.kr/m11_view.php?idx={}&pdfDate={}", id, date);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .build()?;

    let resp = client.get(&url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("Bad status: {}", resp.status()).into());
    }

    let html_text = resp.text().await?;
    let document = Html::parse_document(&html_text);

    // ETF 코드 확인 (go 로직: .prdNum span)
    let prd_num_selector = Selector::parse(".prdNum span").unwrap();
    if let Some(element) = document.select(&prd_num_selector).next() {
        let e_code = element.text().collect::<Vec<_>>().join("").trim().to_string();
        if e_code != code {
             // 주의: 간혹 사이트 구조 변경으로 못 찾을 수도 있으니 에러 처리는 신중히
             // But following Go logic:
             return Err(format!("ETF code mismatch: expected {}, got {}", code, e_code).into());
        }
    }

    // 테이블 파싱 (.table3.moreList1 tbody tr)
    let tr_selector = Selector::parse("table.moreList1 tbody tr").unwrap();
    let td_selector = Selector::parse("td").unwrap();
    
    let mut holdings = Vec::new();

    for element in document.select(&tr_selector) {
        let cells: Vec<_> = element.select(&td_selector).collect();
        if cells.len() < 5 {
            continue;
        }

        // 0: Code, 1: Name, 2: Qty, 3: Value(Price), 4: Weight
        let stock_code = cells[0].text().collect::<Vec<_>>().join("").trim().to_string();
        let name = cells[1].text().collect::<Vec<_>>().join("").trim().to_string();
        let qty_str = cells[2].text().collect::<Vec<_>>().join("").replace(",", "");
        let price_str = cells[3].text().collect::<Vec<_>>().join("").replace(",", "");
        let weight_str = cells[4].text().collect::<Vec<_>>().join("").replace("%", "").trim().to_string();

        let quantity: i64 = qty_str.trim().parse().unwrap_or(0);
        let price: f64 = price_str.trim().parse().unwrap_or(0.0);
        let weight: f64 = weight_str.parse().unwrap_or(0.0);

        holdings.push(Holding {
            date: date.to_string(),
            etf_code: code.to_string(),
            stock_code,
            name,
            weight,
            quantity,
            price,
        });
    }

    Ok(holdings)
}
