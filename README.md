# 📈 Active ETFs

![Active ETFs](https://img.shields.io/badge/version-0.4.0-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg)
![Windows](https://img.shields.io/badge/Windows-10+-black.svg)
![macOS](https://img.shields.io/badge/macOS-Universal-black.svg)

**Active ETFs**는 국내 다양한 자산운용사의 ETF(상장지수펀드) PDF(Portfolio Deposit File) 구성과 비중 변화를 손쉽게 수집하고, 직관적으로 시각화 및 비교 분석할 수 있는 **데스크톱 애플리케이션**입니다.

과거 내역과 현재 내역을 달력을 통해 대조하여 포트폴리오의 신규 편입과 편출 및 비중 변화를 한눈에 파악할 수 있으며, 자체 내장된 스크래핑 엔진을 통해 외부 서버 없이 빠르고 독립적으로 동작합니다.

(라고 AI가 써준 소개글. 이하는 덧붙인 글)

이 프로젝트는 본래 웹서버에서 동작시킬 용도로 스크래퍼 로직부터 만들어두고 방치하던걸 바이브 코딩으로 해보면 좀 쉽게 되려나로 시작된 개인 작업물입니다.
프로젝트 개발 툴은 Antigravity / Claude code 이며, 거의 90%이상의 코드는 Gemini+Claude 에 의해 만들어진 코드입니다. 개인적으로는 Tauri를 첨 써보며 어떻게 사용하는건지 확인하는 차원의 프로젝트이기도 합니다.

* **Windows 용 설치 파일**: [다운로드](https://github.com/joonhochoi/activeetfs/releases/latest/download/activeetfs_0.4.0_x64-setup.exe)
  * 최초 설치 시 "Windows의 PC 보호" 혹은 macOS의 "확인되지 않은 개발자" 경고가 뜰 수 있습니다. 이는 개인 개발자 배포 정책에 의한 것으로 안전하오니 안내에 따라 실행해 주세요. 
  * 이후 업데이트는 앱 시작 시 자동으로 체크하여 무중단 업데이트를 수행합니다.
* **macOS 용 설치 파일 (Universal)**: [다운로드](https://github.com/joonhochoi/activeetfs/releases/latest/download/activeetfs_0.4.0_universal.dmg)
* 최신 릴리스 전체 목록: [Releases](https://github.com/joonhochoi/activeetfs/releases/latest)


<br>

<img src="https://github.com/joonhochoi/activeetfs/blob/main/img/activeetfs_v0.3.1.png" width="320" alt="v0.3.1 스크린샷" /><img src="https://github.com/joonhochoi/activeetfs/blob/main/img/updateall.png" width="240" alt="Update All" /><img src="https://github.com/joonhochoi/activeetfs/blob/main/img/updatetoday.png" width="260" alt="Update Today" /><br>

## ✨ 주요 기능 (Key Features)

* **다양한 자산운용사 지원 (7개)**: 타임폴리오(TIME), 삼성액티브(KoAct), 삼성자산운용(KODEX), KB자산운용(RISE), 한화자산운용(PLUS), 미래에셋(TIGER), 한국투자신탁운용(ACE)의 Active ETF를 지원하며 종목 리스트를 지속적으로 확장 중입니다.
  * **Select ETFs**: 관심 ETF들을 선택하여 관리할 수 있습니다.(선택된 ETF들만 보여지고 업데이트함)
  * **URL로 새 ETF 추가 (Add New ETF)**: 지원 운용사의 ETF 상품 페이지 URL만 붙여넣으면 종목코드·이름·상품 ID를 자동으로 파싱해 목록에 추가합니다.
* **네이티브 기반 독립 실행 (Tauri v2)**: Rust와 Tauri v2 아키텍처를 기반으로 백엔드가 구성되어 빠른 실행 속도와 낮은 리소스 점유율을 자랑합니다.
* **무중단 자동 업데이트**: GitHub Actions를 통한 CI/CD 파이프라인이 구축되어 있어, 새로운 버전이 출시될 때마다 앱 시작 시 자동으로 감지하고 간편하게 업데이트할 수 있습니다.
* **강력한 데이터 스크래핑**: 
  * **안티봇 우회**: Cloudflare 보안 챌린지를 네이티브 WebView를 활용해 우회하여 데이터를 수집합니다.
  * **일괄 업데이트 (Update All)**: 캘린더를 통해 하루 혹은 여러 날짜의 데이터를 한 번의 클릭으로 자동 수집할 수 있습니다.
  * **오늘 업데이트 (Update Today)**: 오늘 날짜의 ETF 데이터를 한 번에 수집하고 전일과의 편입편출 종목을 표시합니다.
  * **한글 인코딩 최적화**: 특정 운용사에서 발생하는 인코딩(Mojibake) 문제를 해결하여 정확한 한글 데이터를 제공합니다.
* **포트폴리오 과거-현재 대조 분석**:
  * 선택한 기준일과 과거 시점의 포트폴리오를 비교하여 신규 편입(NEW), 비중 증감 등을 명확하게 시각화합니다.
* **인터랙티브 대시보드 (ECharts)**:
  * Apache ECharts를 활용해 시계열 비중 변화를 시각화합니다. 
  * **확대/축소(Zoom)** 기능을 지원하여 세밀한 비중 변화를 시점별로 추적할 수 있습니다.
* **사용자 편의성 (UX)**:
  * **관심 종목 (Favorites)**: 자주 보는 ETF를 별 아이콘(★)으로 즐겨찾기하고 상단에 고정할 수 있습니다.
  * **상세 페이지 연동**: 종목명을 더블클릭하면 해당 상품의 공식 웹사이트로 바로 연결됩니다.
  * **ETF 선택/관리 (Select ETFs)**: 운용사별 ETF를 토글 방식으로 활성/비활성화할 수 있습니다.
<br>

## 🛠 기술 스택 (Tech Stack)

### Frontend (User Interface)
* **Framework**: React 19, TypeScript, Vite 7
* **Styling**: 인라인 스타일 + CSS 변수(`styles.css`) — 별도 UI 프레임워크(Tailwind/Mantine 등) 미사용
* **Charts**: Apache ECharts 6 (`echarts-for-react`)
* **Date Picker**: `react-datepicker`

### Backend & Data Pipeline
* **Framework**: Rust (**Tauri v2**)
* **Database**: SQLite (`SQLx` 0.8, 실행 파일 옆에 저장하는 포터블 모드)
* **HTTP / Scraping**: `reqwest`(HTTP 클라이언트) + `scraper`(HTML 파싱) + `tokio`(비동기) 기반 네이티브 스크래퍼. 과거 Go 사이드카 의존은 제거되어 전부 Rust로 통합됨
* **Tauri 플러그인**: updater(자동 업데이트), dialog, process, shell, opener

### Build & Release
* **CI/CD**: GitHub Actions — `v*` 태그 푸시 시 Windows(x86_64)·macOS(Universal) 빌드, 서명, 자동 업데이터용 `latest.json` 생성 및 GitHub Release 게시 (Node.js 24 사용)

<br>

## ⚙️ 설치 가이드 (Installation)

이 프로젝트를 로컬에서 빌드하고 실행하려면 아래의 도구들이 시스템에 구성되어야 합니다.

* [Node.js](https://nodejs.org/) (v18 이상 권장, CI는 v24 사용)
* [Rust](https://rustup.rs/) (최신 Stable, edition 2024 지원 버전) 및 C++ Build Tools (Windows) / Xcode Command Line Tools (macOS)
* 자세한 Tauri v2 시스템 요구사항은 [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) 참고

### 1) 저장소 클론 및 패키지 설치
```bash
git clone https://github.com/joonhochoi/activeetfs.git
cd activeetfs/app
npm install
```

### 2) 개발 모드 실행 (Development)
Tauri 개발 환경이 활성화되며 애플리케이션과 프론트엔드가 동시에 구동됩니다. HMR(Hot Module Replacement)이 반영됩니다.
```bash
npm run tauri dev
```

### 3) 릴리스 빌드 (Production Build)
프로젝트 루트 디렉토리 내 `scripts` 폴더의 자동화 스크립트를 활용하거나 Tauri CLI를 사용합니다.

* **Windows (PowerShell)**:
  ```powershell
  cd scripts
  .\build_release.ps1
  ```
* **macOS (Terminal)**:
  ```bash
  cd app
  npm run tauri build -- --target universal-apple-darwin
  ```

<br>

## 📂 프로젝트 구조 (Directory Structure)

```text
.
├── app/                          # Tauri v2 기반 애플리케이션 (React + Rust)
│   ├── src/                      # 프론트엔드 UI (React, TypeScript)
│   │   ├── components/           # 대시보드, 사이드바, 보유종목 테이블, 업데이트/설정 창 등
│   │   ├── data/
│   │   │   └── activeetfinfos.json  # ETF 카탈로그(운용사·종목코드·상품 ID) — 단일 진실 공급원
│   │   └── utils/                # 공통 유틸 (ETF 해석 등)
│   └── src-tauri/                # 백엔드 핵심 로직 (Rust)
│       └── src/
│           ├── db.rs             # SQLite 초기화·마이그레이션·시딩
│           ├── commands.rs       # 프론트엔드에 노출되는 Tauri 커맨드
│           └── fetch.rs          # 운용사별 데이터 수집 및 URL 파싱
├── .github/workflows/release.yml # 릴리스 자동화(CI/CD)
├── scripts/                      # 배포 및 빌드 자동화 스크립트
├── img/                          # 스크린샷 등 미디어 자산
├── CHANGELOG.md                  # 변경 이력 (앱 내 Changelog에 노출)
└── README.md
```

<br>

## 🏦 지원 운용사 및 데이터 출처 (Supported Providers)

각 운용사 공식 웹사이트에 **공시된 PDF(Portfolio Deposit File)** 데이터를 수집합니다. 수집 방식은 운용사 사이트 구조에 따라 다릅니다.

| 운용사 | 브랜드 | 수집 방식 |
|--------|--------|-----------|
| 타임폴리오자산운용 | TIME | HTML 스크래핑 |
| 삼성액티브자산운용 | KoAct | JSON API (WebView로 Cloudflare 우회) |
| 삼성자산운용 | KODEX | JSON API (WebView로 Cloudflare 우회) |
| KB자산운용 | RISE | HTML 스크래핑 |
| 한화자산운용 | PLUS | JSON API |
| 미래에셋자산운용 | TIGER | HTML 스크래핑 |
| 한국투자신탁운용 | ACE | JSON API |

> ℹ️ 데이터는 운용사 공시 일정에 따라 제공되며, **평일 오전 8시 이후** 수집을 권장합니다. TIGER는 당일 값이 제공되지 않아 직전 영업일 값으로 갱신해야 합니다.

<br>

## 💾 데이터 저장 및 동작 방식

* 수집한 데이터는 외부 서버 전송 없이 **로컬 SQLite 데이터베이스(`activeetf.db`)** 에 저장됩니다. (실행 파일과 같은 디렉토리, 포터블 모드)
* 앱은 별도의 백엔드 서버 없이 운용사 사이트에 직접 접속해 독립적으로 동작합니다.
* 자동 업데이트는 GitHub Releases의 `latest.json`을 통해 무중단으로 이루어집니다.

<br>

## ⚠️ 면책조항 (Disclaimer)

* 본 애플리케이션은 **개인 학습·정보 확인 목적**의 비공식 도구입니다.
* 표시되는 데이터는 운용사 공시 자료를 자동 수집한 것으로, 수집 시점·사이트 구조 변경 등에 따라 **실제 공식 자료와 다를 수 있습니다.** 정확한 정보는 반드시 각 운용사 및 공식 공시를 확인하세요.
* 본 도구가 제공하는 어떠한 정보도 **투자 권유나 자문이 아니며**, 이를 활용한 투자의 책임은 전적으로 사용자 본인에게 있습니다.
* 모든 상표 및 데이터의 권리는 해당 자산운용사에 있습니다.

<br>

## 🤝 기여 (Contributing)

개인 프로젝트이지만 이슈와 PR을 환영합니다. 버그 제보·새 운용사/ETF 추가 요청은 [Issues](https://github.com/joonhochoi/activeetfs/issues)에 남겨주세요. 새 ETF/운용사 추가 절차는 [CLAUDE.md](CLAUDE.md)의 "새 ETF 추가하기" 섹션을 참고하세요.

<br>

## 📄 라이선스 (License)

별도의 라이선스 파일이 지정되어 있지 않은 개인 프로젝트입니다. 사용·배포 관련 문의는 저장소 소유자에게 연락해 주세요.
