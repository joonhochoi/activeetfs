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

// ACE ETF API 응답 구조체
// Structs for parsing ACE ETF JSON responses
#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct AceEtfResponse {
    pdfList: Vec<AceEtfPdfItem>,
}

#[derive(Deserialize, Debug)]
#[allow(non_snake_case)]
struct AceEtfPdfItem {
    wg: f64,               // weight
    jm_KSC_CD: String,     // stock_code
    val_AM: f64,           // price (평가금액)
    cu_ITEM_CNT: String,   // quantity (수량, 문자열)
    sec_NM: String,        // stock_name
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
        "tiger" => fetch_tiger(&id, &code, &date).await.map_err(|e| e.to_string())?,
        "ace" => fetch_ace(&id, &code, &date).await.map_err(|e| e.to_string())?,
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    // 2. DB에 저장하기 (단일 트랜잭션으로 묶어 fsync 비용을 줄인다)
    // 2. Save to DB inside one transaction
    let mut tx = state.db.begin().await.map_err(|e| e.to_string())?;
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
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;

    // 3. 파싱 결과 sanity check: 비중 합계가 비정상이면 경고를 메시지에 덧붙인다.
    //    (사이트 구조 변경으로 컬럼이 밀려 weight를 잘못 읽는 경우를 조기에 드러낸다)
    let msg = format!("Successfully updated {} holdings", holdings.len());
    match check_weight_sanity(&holdings) {
        Some(warn) => Ok(format!("{} ⚠️ {}", msg, warn)),
        None => Ok(msg),
    }
}

// 비중(weight) 합계 sanity check. 정상적인 ETF PDF라면 합계가 100% 부근이다.
// 합계가 비어 있거나(파싱 실패) 정상 범위를 크게 벗어나면 경고 문자열을 반환한다.
fn check_weight_sanity(holdings: &[Holding]) -> Option<String> {
    if holdings.is_empty() {
        return None; // 빈 결과는 "0 holdings" 메시지로 이미 드러나므로 별도 경고 생략
    }
    let sum: f64 = holdings.iter().map(|h| h.weight).sum();
    if sum < 50.0 || sum > 150.0 {
        return Some(format!(
            "비중 합계가 비정상입니다({:.1}%). 운용사 사이트 구조 변경/파싱 오류 가능성이 있습니다.",
            sum
        ));
    }
    None
}

// HTTP 요청 재시도 헬퍼: 네트워크 오류 또는 서버측 일시 오류(5xx/429)일 때 지수 백오프로 재시도한다.
// build 클로저는 매 시도마다 RequestBuilder를 새로 만든다(요청은 한 번만 소비되므로).
async fn send_with_retry<F>(build: F) -> Result<reqwest::Response, Box<dyn std::error::Error>>
where
    F: Fn() -> reqwest::RequestBuilder,
{
    const MAX_ATTEMPTS: u32 = 3;
    let mut last_err: String = String::new();
    for attempt in 1..=MAX_ATTEMPTS {
        match build().send().await {
            Ok(resp) => {
                let status = resp.status();
                // 일시적 서버 오류는 재시도 대상. 그 외(성공/4xx 등)는 그대로 반환해 호출부가 처리.
                if (status.is_server_error() || status.as_u16() == 429) && attempt < MAX_ATTEMPTS {
                    last_err = format!("status {}", status);
                    tokio::time::sleep(Duration::from_millis(300 * attempt as u64)).await;
                    continue;
                }
                return Ok(resp);
            }
            Err(e) => {
                last_err = e.to_string();
                if attempt < MAX_ATTEMPTS {
                    tokio::time::sleep(Duration::from_millis(300 * attempt as u64)).await;
                    continue;
                }
            }
        }
    }
    Err(format!("요청 실패(재시도 {}회): {}", MAX_ATTEMPTS, last_err).into())
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
        (function() {
            if (window !== window.top) return;
            if (window.__SCRAPER_STARTED__) return;
            window.__SCRAPER_STARTED__ = true;

            const signal = (type, data = "") => {
                const url = 'http://localhost/scraper-' + type + (data ? '?json=' + encodeURIComponent(data) : '');
                window.location.href = url;
            };

            // Retry counter via sessionStorage to prevent infinite reload loops
            const RETRY_KEY = '__CF_RETRY_COUNT__';
            const MAX_RETRIES = 5;
            const getRetryCount = () => parseInt(sessionStorage.getItem(RETRY_KEY) || '0', 10);
            const incrementRetry = () => sessionStorage.setItem(RETRY_KEY, String(getRetryCount() + 1));
            const clearRetries = () => sessionStorage.removeItem(RETRY_KEY);

            async function run() {
                const text = document.body.innerText.trim();
                const isProbablyJson = document.contentType === 'application/json' || text.startsWith('{') || text.startsWith('[');

                if (isProbablyJson) {
                    clearRetries(); // Success path - reset counter
                    try {
                        const resp = await fetch(window.location.href, { cache: 'no-store' });
                        if (resp.ok) {
                            const buffer = await resp.arrayBuffer();
                            const decoded = new TextDecoder('utf-8').decode(buffer);
                            signal('data', decoded);
                            return;
                        }
                    } catch (e) {
                        console.error('Fetch failed:', e);
                    }
                    // Fallback to current text if fetch fails
                    signal('data', text);
                } else if (text.includes('Cloudflare') || text.includes('DDoS') || text.includes('Challenge') || text.length < 50) {
                    const retries = getRetryCount();

                    // Check if Cloudflare challenge already passed but page is stuck
                    // ("확인에 성공했습니다" = verification successful, "기다리는" = waiting)
                    const isStuckAfterPass = text.includes('성공') || text.includes('기다리는') || text.includes('Waiting');
                    
                    if (isStuckAfterPass && retries < MAX_RETRIES) {
                        // Auto-reload after a short delay to let Cloudflare session settle
                        console.log('[Scraper] CF passed but stuck, auto-reloading... (attempt ' + (retries + 1) + '/' + MAX_RETRIES + ')');
                        incrementRetry();
                        setTimeout(() => { window.location.reload(); }, 3000);
                        return; // Don't show window yet, let auto-reload attempt
                    }

                    // Either not stuck-after-pass, or retries exhausted -> show manual UI
                    // Add UI bar for manual intervention
                    document.body.style.paddingBottom = '70px';
                    const bar = document.createElement('div');
                    bar.style.cssText = 'position:fixed; bottom:0; left:0; right:0; height:60px; padding:0 20px; background:#1e293b; border-top:2px solid #3b82f6; color:#f8fafc; display:flex; justify-content:space-between; align-items:center; z-index:2147483647; font-family:sans-serif; box-shadow:0 -4px 15px rgba(0,0,0,0.5);';
                    bar.innerHTML = '<div><span style="color:#fbbf24; font-size:1.2em; margin-right:8px;">⚠️</span> 로봇 보안 확인(Cloudflare)을 통과한 후 <b>완료</b>를 눌러주세요.</div>';
                    
                    const btn = document.createElement('button');
                    btn.innerText = '인증 완료 (계속하기)';
                    btn.style.cssText = 'padding:10px 20px; background:#10b981; color:white; border:none; borderRadius:6px; cursor:pointer; fontWeight:bold;';
                    btn.onclick = () => { clearRetries(); window.location.reload(); };
                    
                    bar.appendChild(btn);
                    document.body.appendChild(bar);
                    
                    // Signal show after a brief delay
                    setTimeout(() => signal('show'), 300);
                }
            }

            if (document.readyState === 'complete') {
                run();
            } else {
                window.addEventListener('load', run);
                // Fail-safe
                setTimeout(run, 3000);
            }
        })();
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
    .title(format!("데이터 로드 중... ({})", provider))
    .inner_size(900.0, 700.0)
    .visible(false)
    .initialization_script(init_script)
    .on_navigation(move |nav_url| {
        let url_str = nav_url.as_str();
        if url_str.starts_with("http://localhost/scraper-show") {
            if let Some(w) = app_clone.get_webview_window(&window_label_show) {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.set_always_on_top(true);
                let _ = w.set_always_on_top(false); // Quick flash to front
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

    // POST 요청 전송 (일시 오류 시 재시도)
    let resp = send_with_retry(|| client.post(url).headers(headers.clone()).form(&params)).await?;

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

    // ── 헤더명 기반 컬럼 매핑 (+ 위치 기반 fallback) ──────────────────────────
    // RISE 응답은 보통 "종목명"을 포함한 헤더행을 동봉한다. 헤더가 있으면 라벨로
    // 컬럼 인덱스를 찾고, 헤더가 없거나 특정 라벨을 못 찾으면 기존 고정 인덱스를
    // 사용한다. 이렇게 하면 운용사가 컬럼 순서를 바꿔도 견고하면서 회귀(regression)도 없다.
    // 기본(고정) 인덱스: 0:No 1:Name 2:Code 3:Qty 4:Weight 5:Price
    let (mut i_name, mut i_code, mut i_qty, mut i_weight, mut i_price) = (1usize, 2usize, 3usize, 4usize, 5usize);

    let header_labels: Option<Vec<String>> = document
        .select(&tr_selector)
        .map(|tr| {
            tr.select(&td_selector)
                .map(|c| c.text().collect::<String>().trim().to_string())
                .collect::<Vec<_>>()
        })
        .find(|cells| cells.iter().any(|c| c.contains("종목명")));

    if let Some(ref labels) = header_labels {
        let find_idx = |keywords: &[&str]| -> Option<usize> {
            labels.iter().position(|l| keywords.iter().any(|k| l.contains(k)))
        };
        if let Some(i) = find_idx(&["종목명"]) { i_name = i; }
        if let Some(i) = find_idx(&["종목코드", "코드"]) { i_code = i; }
        if let Some(i) = find_idx(&["수량", "주식수", "계약수"]) { i_qty = i; }
        if let Some(i) = find_idx(&["비중", "비율"]) { i_weight = i; }
        if let Some(i) = find_idx(&["평가금액", "보유금액", "금액", "평가"]) { i_price = i; }
    }

    let max_idx = [i_name, i_code, i_qty, i_weight, i_price].into_iter().max().unwrap_or(5);

    let mut holdings = Vec::new();

    // 각 행(tr) 순회
    for element in document.select(&tr_selector) {
        let cells: Vec<_> = element.select(&td_selector).collect();
        if cells.len() <= max_idx {
            continue; // 데이터 행이 아니거나 컬럼 수가 부족한 행은 건너뛴다
        }

        let get = |idx: usize| -> String {
            cells.get(idx).map(|c| c.text().collect::<String>().trim().to_string()).unwrap_or_default()
        };

        let name = get(i_name);
        let stock_code = get(i_code);

        if name == "종목명" || stock_code.is_empty() {
            continue; // 헤더나 빈 줄 건너뛰기
        }

        let quantity = get(i_qty).replace(",", "").trim().parse::<i64>().unwrap_or(0);
        let weight = get(i_weight).replace(",", "").replace("%", "").trim().parse::<f64>().unwrap_or(0.0);
        let price = get(i_price).replace(",", "").trim().parse::<f64>().unwrap_or(0.0);

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

        let resp = send_with_retry(|| client.get(&url)).await?;
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
                // 주의: PLUS(한화) PDF API는 종목별 평가금액(가격)을 제공하지 않는다.
                // 따라서 PLUS ETF의 holdings.price는 항상 0이며, 금액 기반 분석을 추가할 때
                // PLUS만 가격이 비어 있다는 점을 별도로 처리해야 한다. (weight/quantity는 정상)
                price: 0.0,
            });
        }

        page += 1;

        // 너무 빠른 요청 방지. async 함수이므로 tokio sleep을 사용해 워커 스레드를 블로킹하지 않는다.
        // 페이지가 많을수록(>5) 조금 더 길게 쉬어 서버 부하/차단을 피한다.
        let delay_ms = if total_pages > 5 { 200 } else { 100 };
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
    }

    Ok(holdings)
}

// TIGER 데이터 가져오기 (HTML 스크래핑, POST 요청, 페이지네이션)
// Fetch TIGER (Mirae Asset) data using HTML scraping via POST with pagination
async fn fetch_tiger(id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    // 날짜 형식 변환: YYYY-MM-DD -> YYYY.MM.DD
    let fix_date = date.replace("-", ".");

    let url = "https://investments.miraeasset.com/tigeretf/ko/product/search/detail/pdfListAjax.ajax";
    let referer = format!(
        "https://investments.miraeasset.com/tigeretf/ko/product/search/detail/index.do?ksdFund={}",
        id
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()?;

    let mut holdings = Vec::new();
    let mut page_index = 1i32;
    let list_cnt = 10i32;
    let mut total_pages = 1i32;

    let tr_selector = Selector::parse("tr").unwrap();
    let td_selector = Selector::parse("td").unwrap();

    loop {
        let mut headers = header::HeaderMap::new();
        headers.insert("Referer", referer.parse().unwrap());
        headers.insert("Origin", "https://investments.miraeasset.com".parse().unwrap());
        headers.insert(header::CONTENT_TYPE, "application/x-www-form-urlencoded; charset=UTF-8".parse().unwrap());
        headers.insert("X-Requested-With", "XMLHttpRequest".parse().unwrap());
        headers.insert("Accept", "text/html, */*; q=0.01".parse().unwrap());
        headers.insert("Accept-Language", "ko,en-US;q=0.9,en;q=0.8".parse().unwrap());

        let body = if page_index == 1 {
            format!(
                "ksdFund={}&pageIndex={}&firstIndex=0&listCnt={}&fixDate={}&prfPrd=Week01&order=SRD",
                id, page_index, list_cnt, fix_date
            )
        } else {
            format!(
                "ksdFund={}&pageIndex={}&listCnt={}&fixDate={}&prfPrd=Week01&order=SRD",
                id, page_index, list_cnt, fix_date
            )
        };


        let resp = send_with_retry(|| client.post(url).headers(headers.clone()).body(body.clone())).await?;

        let status = resp.status();
        if !status.is_success() {
            return Err(format!("Bad status: {} (page {})", status, page_index).into());
        }

        let html_text = resp.text().await?;

        // Html은 Send가 아니므로 await 전에 블록 내에서 파싱 후 드롭
        let page_holdings: Vec<Holding> = {
            let wrapped = format!("<table>{}</table>", html_text);
            let document = Html::parse_document(&wrapped);

            // 첫 페이지: data-tot-cnt 속성이 있는 첫 번째 tr에서 총 종목 수 파악
            if page_index == 1 {
                if let Some(tr) = document.select(&tr_selector).find(|tr| tr.value().attr("data-tot-cnt").is_some()) {
                    let total_count = tr.value().attr("data-tot-cnt")
                        .and_then(|s| s.trim().parse::<i64>().ok())
                        .unwrap_or(0);
                    total_pages = ((total_count + list_cnt as i64 - 1) / list_cnt as i64).max(1) as i32;
                }
            }

            let mut page_result = Vec::new();
            for tr in document.select(&tr_selector) {
                // data-tot-cnt 속성이 있는 행만 실제 데이터 행으로 처리
                if tr.value().attr("data-tot-cnt").is_none() {
                    continue;
                }
                let cells: Vec<_> = tr.select(&td_selector).collect();
                if cells.len() < 5 {
                    continue;
                }

                // td[0]: 종목코드, td[1]: 종목명, td[2]: 수량, td[3]: 평가금액, td[4]: 비중
                let stock_code = cells[0].text().collect::<Vec<_>>().join("").trim().to_string();
                let name = cells[1].text().collect::<Vec<_>>().join("").trim().to_string();
                let qty_str = cells[2].text().collect::<Vec<_>>().join("").replace(",", "");
                let price_str = cells[3].text().collect::<Vec<_>>().join("").replace(",", "");
                let weight_str = cells[4].text().collect::<Vec<_>>().join("").replace(",", "");

                if stock_code.is_empty() || name.is_empty() {
                    continue;
                }

                let quantity = qty_str.trim().parse::<i64>().unwrap_or(0);
                let price = price_str.trim().parse::<f64>().unwrap_or(0.0);
                let weight = weight_str.trim().parse::<f64>().unwrap_or(0.0);

                page_result.push(Holding {
                    date: date.to_string(),
                    etf_code: code.to_string(),
                    stock_code,
                    name,
                    weight,
                    quantity,
                    price,
                });
            }
            page_result
        }; // document가 여기서 드롭됨

        holdings.extend(page_holdings);

        if page_index >= total_pages {
            break;
        }

        page_index += 1;
        tokio::time::sleep(Duration::from_millis(100)).await;
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

    let resp = send_with_retry(|| client.get(&url)).await?;
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

// ACE 데이터 가져오기 (JSON API)
// Fetch ACE (Korea Investment) data using JSON API
async fn fetch_ace(id: &str, code: &str, date: &str) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
    let clean_date = date.replace("-", "");

    let url = format!(
        "https://papi.aceetf.co.kr/api/funds/{}/pdf?page=1&size=1000&std_dt={}",
        id, clean_date
    );

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()?;

    let mut headers = header::HeaderMap::new();
    headers.insert("Origin", "https://www.aceetf.co.kr".parse().unwrap());
    headers.insert("Referer", "https://www.aceetf.co.kr/".parse().unwrap());
    headers.insert("Accept", "application/json, text/plain, */*".parse().unwrap());

    let resp = send_with_retry(|| client.get(&url).headers(headers.clone())).await?;

    if !resp.status().is_success() {
        return Err(format!("Bad status: {}", resp.status()).into());
    }

    let parsed: AceEtfResponse = resp.json().await?;

    let mut holdings = Vec::new();
    for item in parsed.pdfList {
        let quantity = item.cu_ITEM_CNT.replace(",", "").parse::<i64>().unwrap_or(0);

        holdings.push(Holding {
            date: date.to_string(),
            etf_code: code.to_string(),
            stock_code: item.jm_KSC_CD,
            name: item.sec_NM,
            weight: item.wg,
            quantity,
            price: item.val_AM,
        });
    }

    Ok(holdings)
}

// ── URL로부터 ETF 정보 조회 (Add New ETF 기능용) ──────────────────────────

pub struct ParsedEtfInfo {
    pub manager_id: String,
    pub etf_id: String,
    pub code: String,
    pub name: String,
}

fn build_client() -> reqwest::Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
}

pub async fn fetch_etf_info_from_url(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    if url.contains("timeetf.co.kr") {
        fetch_time_etf_info(url).await
    } else if url.contains("samsungactive.co.kr") {
        fetch_koact_etf_info(url).await
    } else if url.contains("samsungfund.com") {
        fetch_kodex_etf_info(url).await
    } else if url.contains("riseetf.co.kr") {
        fetch_rise_etf_info(url).await
    } else if url.contains("plusetf.co.kr") {
        fetch_plus_etf_info(url).await
    } else if url.contains("miraeasset.com") {
        fetch_tiger_etf_info(url).await
    } else if url.contains("aceetf.co.kr") {
        fetch_ace_etf_info(url).await
    } else {
        Err("지원되지 않는 URL입니다. 아래 운용사 목록에 있는 URL을 입력해주세요.".into())
    }
}

// ── Timefolio ─────────────────────────────────────────────────────────────
// URL 형태: https://timeetf.co.kr/m11_view.php?idx=22
async fn fetch_time_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url
        .split("idx=").nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 idx 파라미터를 찾을 수 없습니다. (예: https://timeetf.co.kr/m11_view.php?idx=22)")?;

    let client = build_client()?;
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("페이지 요청 실패: {}", resp.status()).into());
    }
    let html = resp.text().await?;
    let document = Html::parse_document(&html);

    let code_sel = Selector::parse(".prdNum span").unwrap();
    let code = document.select(&code_sel).next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 종목코드(.prdNum span)를 찾을 수 없습니다.")?;

    let name_sel = Selector::parse(".prdName").unwrap();
    let name = document.select(&name_sel).next()
        .map(|e| e.text().map(|s| s.trim()).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" "))
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 ETF 이름(.prdName)을 찾을 수 없습니다.")?;

    Ok(ParsedEtfInfo { manager_id: "timefolio".to_string(), etf_id, code, name })
}

// ── 삼성(KoAct/KODEX) 공통: id별 상세 API로 종목코드·이름 조회 ───────────────
// 과거에는 전체 목록(product.do / etf.do)을 받아 fId로 찾았으나, 이 목록 엔드포인트는
// 전체 상품 중 일부(약 20개)만 반환하여 목록에 없는 ETF는 추가가 불가능했다.
// id별 상세 엔드포인트는 모든 상품을 조회할 수 있고 응답의 info.product 안에
// fId / stkTicker / fNm 가 들어 있다. KoAct와 KODEX의 응답 구조가 동일하다.
async fn fetch_samsung_etf_detail(
    detail_url: &str,
    referer: &str,
    manager_id: &str,
    etf_id: String,
) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    #[derive(serde::Deserialize)]
    struct Product {
        #[serde(rename = "fId")] f_id: String,
        #[serde(rename = "stkTicker")] stk_ticker: String,
        #[serde(rename = "fNm")] f_nm: String,
    }
    #[derive(serde::Deserialize)]
    struct Info { product: Product }
    #[derive(serde::Deserialize)]
    struct Resp { info: Info }

    let client = build_client()?;
    let resp = client.get(detail_url).header("Referer", referer).send().await?;
    if !resp.status().is_success() {
        return Err(format!("상품 정보 요청 실패: {} (id={})", resp.status(), etf_id).into());
    }
    let data: Resp = resp.json().await?;
    let p = data.info.product;

    // 잘못된 id에 대해 기본 상품이 반환되는 경우를 막기 위해 응답 id를 검증한다.
    if p.f_id != etf_id {
        return Err(format!("해당 id({})의 상품을 찾을 수 없습니다.", etf_id).into());
    }
    if p.stk_ticker.trim().is_empty() {
        return Err(format!("상품 정보에서 종목코드를 찾을 수 없습니다. (id={})", etf_id).into());
    }

    Ok(ParsedEtfInfo {
        manager_id: manager_id.to_string(),
        etf_id,
        code: p.stk_ticker,
        name: p.f_nm,
    })
}

// ── KoAct (삼성액티브) ────────────────────────────────────────────────────
// URL 형태: https://www.samsungactive.co.kr/etf/view.do?id=2ETFM8
async fn fetch_koact_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.split("id=").nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 id 파라미터를 찾을 수 없습니다. (예: https://www.samsungactive.co.kr/etf/view.do?id=2ETFM8)")?;

    let detail_url = format!("https://www.samsungactive.co.kr/api/v1/product/etf/{}.do", etf_id);
    let referer = format!("https://www.samsungactive.co.kr/etf/view.do?id={}", etf_id);
    fetch_samsung_etf_detail(&detail_url, &referer, "koact", etf_id).await
}

// ── KODEX (삼성자산운용) ──────────────────────────────────────────────────
// URL 형태: https://www.samsungfund.com/etf/product/view.do?id=2ETFH5
async fn fetch_kodex_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.split("id=").nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 id 파라미터를 찾을 수 없습니다. (예: https://www.samsungfund.com/etf/product/view.do?id=2ETFH5)")?;

    let detail_url = format!("https://www.samsungfund.com/api/v1/kodex/product/{}.do", etf_id);
    let referer = format!("https://www.samsungfund.com/etf/product/view.do?id={}", etf_id);
    fetch_samsung_etf_detail(&detail_url, &referer, "kodex", etf_id).await
}

// ── RISE (KB자산운용) ─────────────────────────────────────────────────────
// URL 형태: https://www.riseetf.co.kr/prod/finderDetail/44K0
async fn fetch_rise_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.trim_end_matches('/')
        .rsplit('/').next()
        .and_then(|s| s.split('?').next())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 ETF ID를 찾을 수 없습니다. (예: https://www.riseetf.co.kr/prod/finderDetail/44K0)")?;

    let client = build_client()?;
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("페이지 요청 실패: {}", resp.status()).into());
    }
    let html = resp.text().await?;
    let document = Html::parse_document(&html);

    // 이름: <title>RISE ETF명 - RISE ETF</title>
    let title_sel = Selector::parse("title").unwrap();
    let name = document.select(&title_sel).next()
        .map(|e| e.text().collect::<String>())
        .map(|t| t.split(" - ").next().unwrap_or("").trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 ETF 이름을 찾을 수 없습니다.")?;

    // 코드: 현재 ETF 링크 href 근처에 있는 span.number 텍스트
    let link_pattern = format!("/prod/finderDetail/{}", etf_id);
    let code = extract_rise_code(&html, &link_pattern)
        .ok_or("페이지에서 종목코드(span.number)를 찾을 수 없습니다.")?;

    Ok(ParsedEtfInfo { manager_id: "rise".to_string(), etf_id, code, name })
}

fn extract_rise_code(html: &str, link_pattern: &str) -> Option<String> {
    let pos = html.find(link_pattern)?;
    let after = &html[pos..];
    // link → span.number 순서로 탐색
    let span_start = after.find(r#"class="number""#)?;
    let span_tail = &after[span_start..];
    let open = span_tail.find('(')?;
    let close = span_tail[open..].find(')')?;
    let code = span_tail[open + 1..open + close].trim().to_string();
    if code.is_empty() { None } else { Some(code) }
}

// ── PLUS (한화자산운용) ───────────────────────────────────────────────────
// URL 형태: https://www.plusetf.co.kr/product/detail?n=006397
async fn fetch_plus_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.split("n=").nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 n 파라미터를 찾을 수 없습니다. (예: https://www.plusetf.co.kr/product/detail?n=006397)")?;

    let client = build_client()?;
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("페이지 요청 실패: {}", resp.status()).into());
    }
    let html = resp.text().await?;
    let document = Html::parse_document(&html);

    // 이름: <title>PLUS ETF명 | PLUS ETF</title>
    let title_sel = Selector::parse("title").unwrap();
    let name = document.select(&title_sel).next()
        .map(|e| e.text().collect::<String>())
        .map(|t| t.split(" | ").next().unwrap_or("").trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 ETF 이름을 찾을 수 없습니다.")?;

    // 코드: div.summary__product-code
    let code_sel = Selector::parse(".summary__product-code").unwrap();
    let code = document.select(&code_sel).next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 종목코드(.summary__product-code)를 찾을 수 없습니다.")?;

    Ok(ParsedEtfInfo { manager_id: "plus".to_string(), etf_id, code, name })
}

// ── TIGER (미래에셋) ──────────────────────────────────────────────────────
// URL 형태: https://investments.miraeasset.com/tigeretf/ko/product/search/detail/index.do?ksdFund=KR70168K0008
async fn fetch_tiger_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.split("ksdFund=").nth(1)
        .and_then(|s| s.split('&').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 ksdFund 파라미터를 찾을 수 없습니다. (예: ...?ksdFund=KR70168K0008)")?;

    let client = build_client()?;
    let resp = client.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(format!("페이지 요청 실패: {}", resp.status()).into());
    }
    let html = resp.text().await?;
    let document = Html::parse_document(&html);

    // 종목코드: input[name="jongCode"] value
    let code_sel = Selector::parse(r#"input[name="jongCode"]"#).unwrap();
    let code = document.select(&code_sel).next()
        .and_then(|e| e.value().attr("value"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 종목코드(input[name=jongCode])를 찾을 수 없습니다.")?;

    // ETF 이름: input[name="jongName"] value
    let name_sel = Selector::parse(r#"input[name="jongName"]"#).unwrap();
    let name = document.select(&name_sel).next()
        .and_then(|e| e.value().attr("value"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or("페이지에서 ETF 이름(input[name=jongName])을 찾을 수 없습니다.")?;

    Ok(ParsedEtfInfo { manager_id: "tiger".to_string(), etf_id, code, name })
}

// ── ACE (한국투자신탁운용) ────────────────────────────────────────────────
// URL 형태: https://www.aceetf.co.kr/fund/K55101ES8039
async fn fetch_ace_etf_info(url: &str) -> Result<ParsedEtfInfo, Box<dyn std::error::Error + Send + Sync>> {
    let etf_id = url.trim_end_matches('/')
        .rsplit('/').next()
        .and_then(|s| s.split('?').next())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .ok_or("URL에서 ETF ID를 찾을 수 없습니다. (예: https://www.aceetf.co.kr/fund/K55101ES8039)")?;

    #[derive(serde::Deserialize)]
    struct AceFundInfo {
        #[serde(rename = "fundNm")]
        fund_nm: String,
        #[serde(rename = "stockCd")]
        stock_cd: String, // ISIN: KR7{6자리코드}{체크}
    }

    let api_url = format!("https://papi.aceetf.co.kr/api/funds/{}", etf_id);
    let client = build_client()?;
    let mut hdrs = header::HeaderMap::new();
    hdrs.insert("Origin", "https://www.aceetf.co.kr".parse().unwrap());
    hdrs.insert("Referer", "https://www.aceetf.co.kr/".parse().unwrap());

    let resp = client.get(&api_url).headers(hdrs).send().await?;
    if !resp.status().is_success() {
        return Err(format!("ACE API 요청 실패: {} (id={})", resp.status(), etf_id).into());
    }
    let info: AceFundInfo = resp.json().await?;

    // ISIN KR7{코드6자리}{체크3자리} → 코드는 [3..9]
    if info.stock_cd.len() < 9 {
        return Err(format!("잘못된 ISIN 코드: {}", info.stock_cd).into());
    }
    let code = info.stock_cd[3..9].to_string();

    Ok(ParsedEtfInfo { manager_id: "ace".to_string(), etf_id, code, name: info.fund_nm })
}
