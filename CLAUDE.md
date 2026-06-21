# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

Active ETFs는 한국 액티브 ETF의 포트폴리오 구성(PDF, Portfolio Deposit File) 및 변화를 추적하는 Tauri v2 데스크탑 앱이다. 7개 자산운용사에서 보유 종목 데이터를 직접 스크래핑(별도 백엔드 서버 없음)해 로컬 SQLite 데이터베이스에 저장하고, React 대시보드로 비중 변화를 시각화·비교한다. 현재 버전은 **0.3.5**다.

## 개발 명령어

모든 명령어는 `app/` 디렉토리에서 실행한다:

```bash
# 전체 개발 모드 실행 (Rust 백엔드 + React 프론트엔드 HMR)
npm run tauri dev

# 프론트엔드만 실행 (Vite 개발 서버, 포트 1420)
npm run dev

# 프로덕션 빌드
npm run tauri build

# macOS 유니버설 바이너리 빌드
npm run tauri build -- --target universal-apple-darwin

# Cargo.toml / tauri.conf.json / package.json 버전 동기화 (scripts/update-version.js)
npm run version-sync

# 릴리즈 빌드 헬퍼 (scripts/build.js)
npm run build:release
```

이 프로젝트에는 자동화된 테스트가 없다.

## 아키텍처

### 레이어 구조

```
React 프론트엔드 (TypeScript + React 19 + Vite 7)
    ↕ Tauri IPC (invoke())
Rust 백엔드 (Tauri v2 commands)
    ↕ SQLx (런타임 쿼리, 컴파일타임 검증 없음)
SQLite 데이터베이스 (activeetf.db — Portable 모드: 실행 파일과 같은 디렉토리)
```

데이터 수집은 외부 사이드카가 아니라 Rust 백엔드 안에서 직접 이루어진다(과거 Go 스크래퍼를 `fetch.rs`로 포팅). 운용사 사이트를 호출해 받은 보유 종목을 그대로 `holdings` 테이블에 `INSERT OR REPLACE` 한다.

### 프론트엔드 (`app/src/`)

- **`App.tsx`** — 루트 컴포넌트; 전역 상태(선택 ETF, 즐겨찾기, changelog) 관리, 시작 시 업데이터 체크 및 버전 변경 감지
- **`components/`**
  - `Layout.tsx` — 좌측 사이드바 + 메인 + 우측 패널 레이아웃, 메뉴(Help/Changelog/Select ETFs/Add ETF/UpdateAll/UpdateToday/Exit), 보조 WebviewWindow 생성
  - `Sidebar.tsx` — 운용사별 ETF 목록(즐겨찾기·사용자추가 NEW 배지 포함). 활성 ETF 목록은 `get_etf_enabled_list`, 사용자 추가분은 `get_user_added_etfs`로 가져옴
  - `Dashboard.tsx` — ECharts 시계열 차트(Top N, 확대/split 뷰, 커스텀 레전드), 날짜별 업데이트, 편입/편출 In/Out 분석(프론트에서 직접 계산)
  - `HoldingsTable.tsx` — 우측 패널, 특정 날짜의 보유 종목과 비교 날짜 대비 비중 증감 표시
  - `UpdateAllWindow.tsx` — 여러 날짜 선택 후 전체 ETF 일괄 업데이트(해시 라우트 `#update-all`)
  - `UpdateTodayWindow.tsx` — 당일 전체 ETF 업데이트 + 직전 영업일 대비 편입/편출 요약(해시 라우트 `#update-today`)
  - `SelectEtfsWindow.tsx` — ETF별 활성/비활성 토글(해시 라우트 `#select-etfs`)
  - `AddEtfModal.tsx` — 운용사 상품 페이지 URL로 새 ETF 추가
  - `ChangelogModal.tsx` — `CHANGELOG.md` 표시(버전 변경 시 자동 노출)
- **`data/activeetfinfos.json`** — 정적 ETF 카탈로그: 7개 운용사, ETF별 표시 이름·종목코드(`code`)·운용사 상품 ID(`id`)·`type`(provider)·`view_url`. ETF 목록의 단일 진실 공급원(source of truth)이며 앱 시작 시 DB에 시딩된다.
- 보조 창들은 별도 라우터 없이 `window.location.hash` 값으로 분기한다(`App.tsx`).
- Rust 호출은 `@tauri-apps/api/core`의 `invoke()`를 사용

### 백엔드 (`app/src-tauri/src/`)

| 파일 | 역할 |
|------|------|
| `main.rs` | 진입점; 패닉 훅 → OS 로그 경로(`debug_startup.log`) 설정 |
| `lib.rs` | Tauri 앱 빌더; 커맨드 및 플러그인(shell/opener/updater/dialog/process) 등록 |
| `db.rs` | SQLite 초기화, 스키마 생성, `ALTER TABLE` 기반 점진 마이그레이션, JSON에서 초기 시딩 |
| `commands.rs` | 보유 종목 조회·즐겨찾기·활성화 목록·URL로 ETF 추가·버전/changelog 등 Tauri 커맨드 |
| `fetch.rs` | 운용사별 데이터 수집 + URL 파싱(`fetch_etf_info_from_url`). HTTP API/HTML 스크래핑/PDF/WebView 우회 |

주요 Tauri 커맨드: `get_holdings`, `get_holdings_by_date`, `get_latest_date_before`, `check_holdings_exist`, `get_etf_holdings`(fetch.rs), `get_favorite_etfs`, `toggle_etf_favorite`, `get_etf_enabled_list`, `save_etf_enabled_list`, `add_etf_from_url`, `get_user_added_etfs`, `get_changelog`, `check_and_update_version`.

> 참고: `greet`, `run_sidecar`, `analyze_changes`, `analyze_trends`는 등록되어 있으나 현재 프론트엔드에서 호출되지 않는다(템플릿 잔재 또는 미사용 스텁).

### 데이터베이스 스키마

- **`managers`** — 자산운용사 메타데이터 (`id`, `name`, `code`)
- **`etfs`** — ETF 카탈로그 (`code` PK, `manager_id`, `name`) + 마이그레이션으로 추가된 `is_favorite`, `is_enabled`, `etf_id`(운용사 상품 ID), `is_user_added` 플래그
- **`holdings`** — 보유 종목, PK `(date, etf_code, stock_code)`, 컬럼: `stock_name`, `weight`, `quantity`, `price`
- **`metadata`** — key/value (`last_version` 등 앱 상태 추적)

스키마 변경은 SQLite에 `ADD COLUMN ... IF NOT EXISTS`가 없으므로 `ALTER TABLE`을 실행하고 에러를 무시하는 방식으로 처리한다(`db.rs`).

### 운용사별 스크래핑 방식 (`type` = provider)

| 운용사(`type`) | 표시명 | 방식 |
|------|------|------|
| `time` | Timefolio (타임폴리오) | HTML 스크래핑 (GET) |
| `koact` | KoAct (삼성액티브) | JSON API; Cloudflare 우회 위해 WebView 사용 |
| `kodex` | KODEX (삼성자산운용) | JSON API; KoAct와 동일 WebView 경로 |
| `rise` | RISE (KB자산운용) | HTML 조각 스크래핑 (POST) |
| `plus` | PLUS (한화자산운용) | JSON API (페이지네이션, 가격 정보 없음) |
| `tiger` | TIGER (미래에셋) | HTML 스크래핑 (POST, 페이지네이션) |
| `ace` | ACE (한국투자신탁운용) | JSON API |

KoAct/KODEX는 Cloudflare 챌린지를 자연스럽게 통과시키기 위해 숨겨진 `WebviewWindow`를 띄워 페이지 JSON을 읽고, 챌린지가 막히면 사용자에게 수동 인증 바를 노출한다(60초 타임아웃).

## 릴리즈 프로세스

`v*` 태그를 푸시하면 릴리즈가 트리거된다. GitHub Actions 워크플로우(`.github/workflows/release.yml`)가 Windows(x86_64)와 macOS(universal)에서 빌드하고, 아티팩트에 서명한 뒤, Tauri 자동 업데이터용 `latest.json`을 생성해 GitHub Release(초안)로 게시한다.

필요한 시크릿: `TAURI_PRIVATE_KEY`, `TAURI_KEY_PASSWORD`(워크플로우에서 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`로 매핑). 업데이터 공개키와 엔드포인트는 `tauri.conf.json`에 있다.

## 새 ETF 추가하기

**기존 운용사의 ETF**라면 두 가지 경로가 있다:

1. **정적 카탈로그(권장, 영구 반영)**: `app/src/data/activeetfinfos.json`의 해당 운용사 `etfs` 배열에 `code`(종목코드), `name`(표시 이름), `id`(운용사 상품 ID)를 추가한다. 앱 시작 시 DB에 시딩된다.
2. **런타임 추가(UI)**: 앱 메뉴 → Add New ETF → 운용사 상품 페이지 URL 입력. `fetch_etf_info_from_url`이 운용사를 판별해 종목코드·이름·상품 ID를 파싱하고 `is_user_added=1`로 DB에 저장한다.

**새 운용사**를 추가하려면:

1. `activeetfinfos.json`에 운용사 항목(`id`, `name`, `type`, `view_url`, `etfs`)을 추가한다.
2. `fetch.rs`에 `fetch_<provider>` 수집 함수를 추가하고 `get_etf_holdings`의 `match provider` 분기에 등록한다.
3. URL 추가 기능까지 지원하려면 `fetch_<provider>_etf_info`와 `fetch_etf_info_from_url`의 도메인 분기, `AddEtfModal.tsx`의 `SUPPORTED_MANAGERS` 목록도 함께 갱신한다.
