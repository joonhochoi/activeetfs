# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

Active ETFs는 한국 액티브 ETF의 포트폴리오 구성 및 변화를 추적하는 Tauri v2 데스크탑 앱이다. 5개 자산운용사에서 보유 종목 데이터를 스크래핑해 로컬 SQLite 데이터베이스에 저장하고, React 대시보드로 변화를 시각화한다.

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

# Cargo.toml과 tauri.conf.json 버전 동기화
npm run version-sync
```

이 프로젝트에는 자동화된 테스트가 없다.

## 아키텍처

### 레이어 구조

```
React 프론트엔드 (TypeScript + Vite)
    ↕ Tauri IPC (invoke())
Rust 백엔드 (Tauri v2 commands)
    ↕ SQLx
SQLite 데이터베이스 (activeetf.db, 실행 파일 옆에 저장)
```

### 프론트엔드 (`app/src/`)

- **`App.tsx`** — 루트 컴포넌트; 전역 상태 관리 (선택된 ETF, 날짜, 보유 종목 데이터)
- **`components/`** — 사이드바 (즐겨찾기 포함 ETF 목록), 보유 종목 비교 테이블, ECharts 시계열 차트, 업데이트 모달
- **`data/activeetfinfos.json`** — 정적 ETF 카탈로그: 5개 운용사, 50개 이상의 ETF와 운용사별 상품 코드 및 메타데이터. ETF 목록의 단일 진실 공급원(source of truth).
- Rust 호출은 `@tauri-apps/api/core`의 `invoke()`를 사용

### 백엔드 (`app/src-tauri/src/`)

| 파일 | 역할 |
|------|------|
| `main.rs` | 진입점; 패닉 훅 → OS 로그 경로 설정 |
| `lib.rs` | Tauri 앱 빌더; 커맨드 및 플러그인 등록 |
| `db.rs` | SQLite 초기화, 스키마 마이그레이션, JSON에서 초기 데이터 시딩 |
| `commands.rs` | 프론트엔드에 노출되는 Tauri 커맨드 (`get_holdings`, `analyze_changes`, `toggle_etf_favorite` 등) |
| `fetch.rs` | 운용사별 데이터 수집: HTTP API, HTML 스크래핑(scraper 크레이트), PDF 스크래핑(RISE), Cloudflare 우회용 WebView 방식(KoAct) |

### 데이터베이스 스키마

- **`managers`** — 자산운용사 메타데이터
- **`etfs`** — ETF 카탈로그 + `is_favorite` 플래그
- **`holdings`** — (etf_code, date) 기준 보유 종목 데이터
- **`metadata`** — 앱 버전 추적

### 운용사별 스크래핑 방식

| 운용사 | 방식 |
|--------|------|
| TIME | HTML 스크래핑 (reqwest + scraper) |
| KoAct / 삼성 KODEX | API 호출; KoAct는 Cloudflare 우회를 위해 WebView 사용 |
| RISE (KB) | PDF 스크래핑 |
| PLUS (한화) | REST API |

## 릴리즈 프로세스

`v*` 태그를 푸시하면 릴리즈가 트리거된다. GitHub Actions 워크플로우(`.github/workflows/release.yml`)가 Windows(x86_64)와 macOS(universal)에서 빌드하고, 아티팩트에 서명한 뒤, Tauri 자동 업데이터용 `latest.json`을 포함한 GitHub Release를 게시한다.

필요한 시크릿: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## 새 ETF 추가하기

1. `app/src/data/activeetfinfos.json`에 올바른 운용사 ID, 운용사 상품 코드, 표시 이름을 포함한 ETF 항목을 추가한다.
2. 새 운용사라면 `fetch.rs`에 fetch 함수를 추가하고, `commands.rs`와 `lib.rs`에 해당 Tauri 커맨드를 등록한다.
3. DB 시딩은 앱 시작 시 JSON 파일에서 자동으로 이루어진다.
