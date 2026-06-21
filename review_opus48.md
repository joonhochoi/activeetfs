# Active ETFs — 코드 리뷰 (review_opus48.md)

> 작성: Claude Opus 4.8 / 2026-06-21
> 범위: `app/` 전체(Rust 백엔드 + React 프론트엔드), 설정·릴리즈 파일. 버전 0.3.5 기준.
> `review_*.md` 파일은 검토 대상에서 제외함.

전반적으로 **바이브 코딩 결과물 치고 구조가 명확하고 동작도 견고**하다. 운용사 7곳을 각기 다른 방식(API/HTML/PDF/WebView)으로 다루면서도 `get_etf_holdings` 한 곳으로 분기를 모았고, 스키마 마이그레이션, 자동 업데이터, 즐겨찾기/활성화/사용자추가 ETF까지 실사용 기능이 잘 갖춰져 있다. 아래는 우선순위별 개선 포인트와 추가 기능 제안이다.

> **처리 현황 (2026-06-21 업데이트)**
> - 섹션 1: 1-1·1-2·1-3·1-5·1-6·1-7 **반영 완료**, 1-4 **패스(보류)**.
> - 섹션 2: 2-1·2-2·2-4·2-5 **반영 완료**(2-5는 sanity check까지, 헤더 매핑 리팩터링은 잔여), 2-3은 조치 불필요(이미 안전).
> - 섹션 3: 3-1·3-2·3-3 **반영 완료**.
> - 검증: 프론트 `tsc`/`vite build`, 백엔드 `cargo check` 통과 + 개발 모드 기동 스모크 테스트(패닉 0건, WAL 파일 생성, CSP 하 정상 렌더) 확인.

---

## 1. 버그 / 정합성 문제 (우선순위 높음)

### 1-1. 🔴 사용자 추가(URL) ETF는 추가만 되고 **업데이트가 전혀 안 됨**
> ✅ **처리 완료** — `app/src/utils/etfs.ts`에 카탈로그+사용자 ETF를 병합·해석하는 `resolveEtf`/`getAllEtfTargets` 추가. Dashboard(개별 Update)·UpdateAllWindow·UpdateTodayWindow가 모두 이 유틸을 통해 사용자 추가 ETF를 포함하도록 통일. timefolio처럼 manager_id(`timefolio`)와 provider type(`time`)이 다른 케이스는 유틸의 매핑으로 흡수.

가장 중요한 결함이다.

- `Add New ETF`로 추가한 ETF는 DB(`etfs`, `is_user_added=1`)에만 들어가고 **정적 카탈로그(`activeetfinfos.json`)에는 없다.**
- 그런데 데이터 수집을 트리거하는 모든 경로는 카탈로그만 순회한다:
  - [Dashboard.tsx:71-72](app/src/components/Dashboard.tsx#L71-L72) — `activeEtfInfos.managers.find(...)`로 manager/etf를 찾고, [Dashboard.tsx:328](app/src/components/Dashboard.tsx#L328)의 `handleScrape`는 `if (!manager || !etf) return;`로 즉시 종료 → 사용자 추가 ETF는 Update 버튼이 동작하지 않음.
  - [UpdateAllWindow.tsx:68-73](app/src/components/UpdateAllWindow.tsx#L68-L73), [UpdateTodayWindow.tsx:139-154](app/src/components/UpdateTodayWindow.tsx#L139-L154) — 둘 다 `activeEtfInfos.managers`만 순회 → 사용자 추가 ETF는 일괄 업데이트에서도 제외.
- 결과: 사용자가 URL로 ETF를 추가하면 사이드바에 `NEW`로 보이지만 **데이터를 한 번도 가져올 수 없어 항상 빈 차트**가 된다. 기능이 사실상 미완성.
- 해결 방향: 업데이트 대상 목록을 "카탈로그 + `get_user_added_etfs`"를 병합해서 만들도록 통일한다. 사용자 추가 ETF는 DB의 `manager_id`/`etf_id`로 provider·id를 구성할 수 있다(이미 `etf_id`를 저장 중). manager의 `type`은 `manager_id`와 동일하므로 그대로 provider로 사용 가능.

### 1-2. 🟠 편입/편출 분석의 키가 백엔드와 프론트가 다름
> ✅ **처리 완료** — `Dashboard.handleAnalyze`의 편입/편출 판정을 `h.name` → **`h.stock_code`** 기준으로 변경(`startMap`/`endMap`/`dateToStocks` 모두 코드 키). 표시 텍스트와 차트 isolate는 종전대로 종목명을 사용. `UpdateTodayWindow`는 이미 stock_code 기준이라 이제 세 경로가 일관됨.

- 백엔드 `analyze_changes`([commands.rs:91](app/src-tauri/src/commands.rs#L91))는 **`stock_code`** 기준으로 added/removed를 계산한다.
- 프론트 `Dashboard.handleAnalyze`([Dashboard.tsx:411-458](app/src/components/Dashboard.tsx#L411-L458))는 **`h.name`(종목명)** 기준으로 계산한다.
- `UpdateTodayWindow`([UpdateTodayWindow.tsx:245-253](app/src/components/UpdateTodayWindow.tsx#L245-L253))는 또 **`stock_code`** 기준.
- 종목명은 운용사마다 표기가 다르거나(예: "삼성전자" vs "삼성전자보통주") 시점에 따라 바뀔 수 있어, 이름 기준 비교는 동일 종목을 편입/편출로 오판할 수 있다. **`stock_code`로 통일**하는 것이 안전하다. 차트 시리즈 키도 가능하면 코드 기반으로.

### 1-3. 🟠 `analyze_changes`/`analyze_trends`는 등록됐지만 미사용 + 잠재 버그
> ✅ **처리 완료** — 미사용 커맨드 `greet`, `run_sidecar`, `analyze_changes`, `analyze_trends`와 `AnalysisResult` 구조체, 사용처가 사라진 `tauri_plugin_shell::ShellExt`/`AppHandle` import를 제거. `lib.rs`의 `invoke_handler` 등록 목록에서도 삭제. (shell 플러그인 등록 자체는 배포본 영향 최소화를 위해 일단 유지.)

- 프론트 어디서도 호출하지 않는다(`Dashboard`가 자체 계산). `analyze_trends`는 `Ok(vec![])` 빈 스텁([commands.rs:146](app/src-tauri/src/commands.rs#L146)).
- `analyze_changes`의 `changed` 쿼리([commands.rs:129-141](app/src-tauri/src/commands.rs#L129-L141))는 `h2.weight != h1.weight`로 부동소수 정확 비교를 한다. weight가 미세하게 흔들리면 거의 모든 종목이 "changed"로 잡힌다(임계값 비교 필요).
- 정리: 쓸 거면 프론트 로직을 이쪽으로 흡수하고, 아니면 `greet`/`run_sidecar`와 함께 제거해 표면적을 줄이는 게 좋다.

### 1-4. 🟠 DB 저장 위치(Portable 모드)가 macOS 자동 업데이트와 충돌
> ⏭️ **패스(보류)** — 이미 여러 버전 자동 업데이트를 거치는 동안 macOS에서도 실제 데이터 유실이 관측되지 않았고, **이미 배포되어 사용 중인 앱**이라 DB 위치를 바꾸면 기존 사용자 데이터 마이그레이션 리스크가 더 크다고 판단. 현 Portable 위치를 유지한다. (향후 위치 변경이 필요하면 기존 경로 → 신규 경로 자동 이전 로직을 함께 넣을 것.)

- [db.rs:6-13](app/src-tauri/src/db.rs#L6-L13) — DB를 **실행 파일과 같은 디렉토리**에 둔다.
- 자동 업데이터는 설치본을 통째로 교체한다. macOS `.app` 번들은 업데이트 시 교체되므로 번들 내부에 둔 DB는 **업데이트 때 유실**될 수 있고, 번들 내부는 서명 무결성/권한 문제도 있다.
- Windows도 `currentUser` NSIS 설치라 보통 살아남지만, 설치 경로 권한에 따라 쓰기 실패 가능.
- 권장: `app.path().app_data_dir()` 같은 OS 표준 데이터 디렉토리에 저장. "포터블"이 명시적 요구사항이라면 최소한 macOS만이라도 분기 처리. (현재 `init_db`가 `AppHandle`을 `_app`으로 무시하고 있는데, 이걸 활용하면 됨.)

### 1-5. 🟡 PLUS는 `price`가 항상 0
> ✅ **처리 완료** — `fetch_plus`의 `price: 0.0` 위치에 "PLUS API는 평가금액을 제공하지 않으므로 항상 0이며, 금액 기반 분석 추가 시 PLUS만 별도 처리 필요"라는 설명 주석을 보강.

- [fetch.rs:440](app/src-tauri/src/fetch.rs#L440) — PLUS API에 가격이 없어 `price: 0.0`. 현재 UI가 price를 안 쓰니 무해하지만, 향후 평가금액 기반 기능(보유 비중 검증, 금액 추이)을 넣으면 PLUS만 빈다는 점을 인지해야 함. 주석은 있으나 데이터 정합성 측면에서 문서화 필요.

### 1-6. 🟡 `std::thread::sleep`을 async 함수에서 사용
> ✅ **처리 완료** — `fetch_plus` 페이지네이션 지연을 `std::thread::sleep`/`tokio::time::sleep` 혼용에서 **단일 `tokio::time::sleep`**(페이지 많으면 200ms, 아니면 100ms)으로 통일. 워커 스레드 블로킹 제거.

- [fetch.rs:448](app/src-tauri/src/fetch.rs#L448) — PLUS 페이지네이션에서 `total_pages > 5`일 때 `std::thread::sleep`을 호출. 이는 tokio 워커 스레드 전체를 블로킹한다. 바로 아래 else 분기는 `tokio::time::sleep`을 쓰고 있어 일관성도 없다. 주석에도 "tokio sleep이 좋다"고 적혀 있으니 둘 다 `tokio::time::sleep`으로 통일.

### 1-7. 🟡 `analyze`(프론트)는 정확히 그 날짜에 데이터가 있어야만 동작
> ✅ **처리 완료** — `handleAnalyze`에 `snapToData()`를 추가해 선택한 시작/종료일에 데이터가 없으면 **그 날짜 이하의 가장 가까운 데이터일**로 보정. 보정이 일어나면 로그로 안내하고, 보정 결과 두 날짜가 같아지면 "다른 기간 선택" 에러로 처리.

- [Dashboard.tsx:403-409](app/src/components/Dashboard.tsx#L403-L409) — `viewStartDate`/`viewEndDate`에 **정확히 일치하는** 보유 데이터가 없으면 "No data found"로 끝난다. 주말·공휴일·미수집일을 고르면 실패. "선택일 이하의 가장 가까운 데이터일"로 스냅하면 UX가 크게 개선된다(백엔드 `get_latest_date_before`가 이미 있음).

---

## 2. 보안 / 견고성

### 2-1. 🟠 CSP가 비활성화(`"csp": null`)
> ✅ **처리 완료** — `tauri.conf.json`의 CSP를 `default-src 'self'; img-src 'self' data: asset: http://asset.localhost; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost`로 설정. 인라인 `<style>`/`style` 속성과 IPC(updater)·asset 프로토콜은 허용하되 script-src는 `'self'`로 제한. 개발 모드 기동 테스트에서 빈 화면/CSP 차단 없이 정상 렌더 확인.

- [tauri.conf.json:22](app/src-tauri/tauri.conf.json#L22). 메인 윈도우는 로컬 번들 자산만 로드하므로 CSP를 켜도 대부분 문제없다. WebView 스크래핑은 별도 `WebviewWindow`(External URL)라 메인 창 CSP와 무관. 최소한의 CSP를 설정해 XSS 표면을 줄이는 것을 권장.

### 2-2. 🟡 ECharts tooltip에 `innerHTML`로 종목명 직접 삽입
> ✅ **처리 완료** — `Dashboard`에 `escapeHtml()` 헬퍼를 추가하고 tooltip formatter에서 종목명·날짜를 삽입하기 전에 이스케이프. (HoldingsTable은 JSX 렌더라 React가 자동 이스케이프하므로 별도 조치 불필요.)

- [Dashboard.tsx:618-636](app/src/components/Dashboard.tsx#L618-L636), HoldingsTable 등에서 `h.name`을 그대로 HTML 문자열에 끼워 넣는다. 종목명은 운용사 응답에서 오는 외부 데이터다. 현재 신뢰 가능한 출처지만, 운용사 응답이 오염되면 tooltip이 스크립트 주입 벡터가 될 수 있다(CSP off와 결합 시 위험 ↑). 이스케이프 처리 권장.

### 2-3. 🟢 SQL 인젝션은 안전
- 모든 쿼리가 바인드 파라미터를 사용. `add_etf_from_url`은 도메인 화이트리스트로 SSRF도 어느 정도 방어. (좋음)

### 2-4. 🟡 HTTP 수집에 재시도/백오프 없음
> ✅ **처리 완료** — `fetch.rs`에 `send_with_retry()`(최대 3회, 네트워크 오류 및 5xx/429에 지수 백오프 300ms·600ms) 추가. 데이터 수집 fetcher 5종(rise/plus/time/tiger/ace)의 송신부에 적용. KoAct/KODEX는 WebView 경로라 제외.

- KoAct WebView 외 일반 reqwest 경로([fetch.rs](app/src-tauri/src/fetch.rs))는 1회 실패 시 그냥 에러. 운용사 사이트는 일시적 5xx/타임아웃이 잦다. 지수 백오프 재시도(2~3회)를 넣으면 일괄 업데이트 성공률이 올라간다.

### 2-5. 🟡 스크래퍼 파싱이 사이트 구조에 강하게 결합
> ✅ **처리(부분) 완료** — `check_weight_sanity()`를 추가해 수집 결과의 비중 합계가 정상 범위(50~150%)를 벗어나면 `get_etf_holdings` 응답 메시지에 ⚠️ 경고를 덧붙임(컬럼 밀림 등 조용한 오파싱을 드러냄). 헤더명 기반 매핑으로의 전환은 별도 리팩터링 과제로 남김.

- RISE([fetch.rs:361-393](app/src-tauri/src/fetch.rs#L361-L393)), TIGER, TIME 모두 컬럼 인덱스(`cells[2]`, `cells[4]`...)에 의존한다. 운용사가 표 구조를 바꾸면 조용히 잘못된 컬럼을 파싱(수량↔비중 뒤바뀜 등)할 수 있다. 헤더명 기반 매핑이나, 파싱 후 `weight` 합계가 비정상(예: 0 또는 >100*1.5)이면 경고하는 sanity check가 있으면 좋다.

---

## 3. 성능 / 데이터베이스

### 3-1. 🟠 holdings 조회용 인덱스 부재
> ✅ **처리 완료** — `db.rs` 초기화에 `CREATE INDEX IF NOT EXISTS idx_holdings_etf_date ON holdings(etf_code, date)` 추가. 기존 DB(4.9MB)에서도 기동 시 정상 생성 확인.

- PK가 `(date, etf_code, stock_code)`인데, 가장 빈번한 쿼리 `get_holdings`([commands.rs:68-79](app/src-tauri/src/commands.rs#L68-L79))는 `WHERE etf_code = ?`(date 없음)다. PK는 date가 선두라 이 쿼리에 활용되지 못해 **풀 스캔**이 된다. 데이터가 쌓일수록 ETF 전환이 느려진다.
- `CREATE INDEX idx_holdings_etf_date ON holdings(etf_code, date)` 하나면 `get_holdings`, `get_holdings_by_date`, `get_latest_date_before`, `check_holdings_exist`가 모두 빨라진다.

### 3-2. 🟡 일괄 INSERT가 건건 트랜잭션
> ✅ **처리 완료** — `get_etf_holdings`의 holdings INSERT 루프를 단일 트랜잭션(`begin`/`commit`)으로 묶음. 추가로 `db.rs`에서 `PRAGMA journal_mode=WAL` + `synchronous=NORMAL` 설정(런타임에서 `activeetf.db-wal`/`-shm` 생성 확인). (commands.rs의 `run_sidecar`는 1-3에서 제거됨.)

- [fetch.rs:112-127](app/src-tauri/src/fetch.rs#L112-L127), [commands.rs:40-55](app/src-tauri/src/commands.rs#L40-L55) — holding 한 건마다 개별 `execute`. 종목 수백 개면 fsync 비용이 누적된다. 하나의 트랜잭션으로 묶거나 `WAL` 모드 + 배치로 처리하면 빨라진다.

### 3-3. 🟡 Dashboard 차트 계산의 반복 `holdings.find`/`includes`
> ✅ **처리 완료** — `holdingsByDateName`(`Map<date, Map<name, weight>>`) 메모를 추가해 시리즈 데이터 생성의 `holdings.find(...)`를 O(1) 조회로 교체. `seriesNames`/`canSplit`/`chartOption`의 `relevantDates.includes`·`seriesNames.includes`도 `Set` 조회로 전환.

- [Dashboard.tsx:650-653](app/src/components/Dashboard.tsx#L650-L653) 등에서 날짜×시리즈마다 `holdings.find(...)`, `relevantDates.includes(...)`를 호출 → O(N²~N³) 경향. 종목 100개 × 수십 일이면 렌더가 무거워진다. `Map<date, Map<name, weight>>`로 한 번 인덱싱해두면 대폭 개선.

---

## 4. 코드 품질 / 유지보수

### 4-1. 데드 코드 정리
- `greet`([lib.rs:2](app/src-tauri/src/lib.rs#L2)), `run_sidecar`([commands.rs:17](app/src-tauri/src/commands.rs#L17), 더 이상 사이드카 없음), `analyze_changes`/`analyze_trends`(미사용). `types.ts`의 `ManagerInfo.sidecar_exe`, `EtfInfo.args`도 사이드카 시절 잔재.
- 제거하면 capabilities의 `shell:default` 권한도 재검토 가능(현재 `run_sidecar`만 shell을 씀 → 제거 시 권한 축소로 공격 표면 감소).

### 4-2. 편입/편출 분석 로직이 3곳에 중복
- `Dashboard.handleAnalyze`, `UpdateTodayWindow`, 백엔드 `analyze_changes`가 각각 비슷한 diff를 구현. 공통 유틸(이상적으로는 백엔드 커맨드)로 단일화하면 1-2의 정합성 문제도 자연히 해결된다.

### 4-3. `toLocalDateString` 중복 정의
- Dashboard, UpdateAllWindow, UpdateTodayWindow에 동일 함수가 각각 복붙되어 있다. `src/utils/date.ts`로 추출 권장.

### 4-4. 타입 안정성 약화 (`as any` 다발)
- `(manager as any).type`, `(etf as any).id`, `(manager.etfs as any[])` 등이 곳곳에 있다([Dashboard.tsx:348-349](app/src/components/Dashboard.tsx#L348-L349), Sidebar, SelectEtfsWindow 등). `activeetfinfos.json` 구조에 맞는 정확한 타입(`types.ts`의 `ManagerInfo`/`EtfInfo`를 `type`, `view_url`, `id` 포함하도록 갱신)을 정의하면 1-1 같은 누락을 컴파일 단계에서 잡을 수 있다. 현재 `types.ts`는 실제 JSON과 필드가 어긋나 있다(`sidecar_exe`, `args`는 없고 `type`, `view_url`, `id`는 타입에 없음).

### 4-5. 보조 창 ↔ 메인 창 통신 채널 혼재
- 설정 저장은 `app.emit("etf-settings-saved")`(Tauri 이벤트, [commands.rs:313](app/src-tauri/src/commands.rs#L313))로 보내는데, Sidebar는 그걸 안 듣고 `BroadcastChannel('etf-settings')`([Sidebar.tsx:37](app/src/components/Sidebar.tsx#L37))로 듣는다. SelectEtfsWindow는 저장 후 BroadcastChannel로 직접 쏜다([SelectEtfsWindow.tsx:108](app/src/components/SelectEtfsWindow.tsx#L108)). 즉 Tauri 이벤트는 사실상 미사용. 한쪽(BroadcastChannel 또는 Tauri 이벤트)으로 통일하면 혼선이 준다. (BroadcastChannel은 같은 origin의 webview 간만 동작하므로 현 구조에선 잘 맞는 편.)

### 4-6. 일괄 업데이트의 고정 지연(`setTimeout 400ms`)
- [UpdateAllWindow.tsx:116](app/src/components/UpdateAllWindow.tsx#L116), [UpdateTodayWindow.tsx:269](app/src/components/UpdateTodayWindow.tsx#L269) — 모든 ETF 사이에 400ms 대기. ETF가 60개면 순수 대기만 24초+. Cloudflare 안정성 목적이면 WebView를 쓰는 koact/kodex에만 적용하고, 일반 API 운용사는 줄여도 된다.

### 4-7. README / 배지 불일치
- README 배지가 `React-18`인데 실제 `package.json`은 React 19.1([README.md:6](README.md#L6) vs [package.json:23](app/package.json#L23)). "5개 운용사"류 서술도 7개로 갱신 필요. CLAUDE.md는 이번에 7개로 갱신함.

### 4-8. `print`/로그 파일 무한 append
- [main.rs:20-21](app/src-tauri/src/main.rs#L20-L21) — `debug_startup.log`에 매 실행 append만 하고 회전(rotation)이 없다. 장기적으로 무한 증가. 크기 제한 또는 실행 시 truncate 고려.

---

## 5. UX 개선 제안

- **분석 날짜 스냅**(1-7) — 데이터 없는 날짜 선택 시 가장 가까운 영업일로 자동 보정.
- **차트 빈 상태 안내** — 데이터가 없는 ETF(특히 사용자 추가분)에서 "아직 수집된 데이터가 없습니다. Update를 눌러주세요" 안내. 현재는 빈 차트만 보임.
- **로그 영속화** — Dashboard 로그는 ETF 전환 시 사라진다([Dashboard.tsx:256](app/src/components/Dashboard.tsx#L256)). 수집 실패 원인 추적이 어렵다.
- **TIGER 당일 데이터 부재 안내**가 헤더 텍스트로만 있음([UpdateTodayWindow.tsx:303](app/src/components/UpdateTodayWindow.tsx#L303)). provider별 "T-1만 제공" 같은 메타를 카탈로그에 두고 UI에서 자동 처리하면 깔끔.
- **즐겨찾기/사용자추가 ETF 삭제 기능 부재** — 추가는 되는데(`add_etf_from_url`) 제거 커맨드가 없다. 잘못 추가하면 DB를 직접 만져야 함.

---

## 6. 추가하면 좋을 기능 제안

1. **사용자 추가 ETF 업데이트 지원 (필수, 1-1의 해결)** — 모든 일괄·개별 업데이트가 카탈로그+DB(`is_user_added`)를 합쳐 동작하도록. 이게 빠지면 Add New ETF 기능 자체가 의미 없음.
2. **사용자 추가 ETF 삭제 커맨드** (`remove_user_etf(code)`), 사이드바 컨텍스트 메뉴.
3. **금액/평가액 기반 분석** — `quantity`·`price`가 이미 저장되므로, 비중 외에 보유 금액 추이, 매수/매도 추정(수량 변화)을 보여줄 수 있다. (PLUS는 price 0이라 별도 처리.)
4. **CSV/Excel 내보내기** — 특정 ETF의 기간별 보유/비중을 내보내기. 투자자 수요가 큼.
5. **여러 ETF 교차 비교** — "이 종목을 담고 있는 모든 ETF" 역조회. `holdings`에 stock_code 인덱스만 있으면 쉽게 가능하고, 액티브 ETF 추종자에게 매우 유용.
6. **자동 스케줄 수집** — Tauri 백그라운드 + 평일 장마감 후 자동 업데이트(현재는 수동). OS 알림으로 편입/편출 변동 통지.
7. **데이터 백업/복원** — Portable DB를 내보내기/가져오기. 기기 이동·업데이트 유실(1-4) 대비.
8. **테스트 도입** — 최소한 각 운용사 파서에 대해 저장된 HTML/JSON 픽스처 기반 단위 테스트. 사이트 구조 변경 시 회귀를 잡는 가장 비용 대비 효과 큰 투자(현재 테스트 0개).
9. **수집 상태 캐시/진단 화면** — 운용사별 마지막 성공 시각, 최근 실패 사유를 한눈에. 스크래퍼가 깨졌는지 빠르게 판단 가능.

---

## 7. 요약 (착수 우선순위)

| 순위 | 항목 | 근거 | 상태 |
|------|------|------|------|
| 1 | 사용자 추가 ETF 업데이트 경로(1-1) | 기능이 사실상 미완성 | ✅ 완료 |
| 2 | 편입/편출 키를 stock_code로 통일(1-2) | 오탐 가능성 + 로직 중복 | ✅ 완료(프론트), 4-2는 잔여 |
| 3 | holdings 인덱스 추가 + WAL/트랜잭션(3-1, 3-2) | 데이터 증가 시 체감 성능 | ✅ 완료 |
| 4 | DB 저장 위치 재검토(1-4) | macOS 업데이트 데이터 유실 위험 | ⏭️ 패스(보류) |
| 5 | 데드 코드/타입 정리(4-1 일부, 1-3) | 유지보수성 + 권한 축소 | ✅ 미사용 커맨드 제거 |
| 6 | 스크래퍼 재시도 + sanity check(2-4, 2-5) | 일괄 수집 신뢰성 | ✅ 완료(헤더 매핑 잔여) |
| 7 | analyze 날짜 스냅 / PLUS price 문서화 / sleep 정리(1-5,1-6,1-7) | UX·정합성 | ✅ 완료 |
| 8 | CSP 활성화 / tooltip 이스케이프 / 차트 인덱싱(2-1, 2-2, 3-3) | 보안·성능 | ✅ 완료 |

세부 위치는 각 항목의 파일:라인 링크를 참고. 추가로 깊게 보고 싶은 항목이 있으면 알려주세요.
