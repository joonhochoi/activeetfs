# 📈 Active ETF Viewer

![Active ETF Viewer](https://img.shields.io/badge/version-0.1.0-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-Rust-orange.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)

**Active ETF Viewer**는 국내 다양한 자산운용사의 ETF(상장지수펀드) PDF(Portfolio Deposit File) 구성과 비중 변화를 손쉽게 수집하고, 직관적으로 시각화 및 비교 분석할 수 있는 **데스크톱 애플리케이션**입니다.

과거 내역과 현재 내역을 달력을 통해 대조하여 포트폴리오의 신규 편입과 편출 및 비중 변화를 한눈에 파악할 수 있으며, 자체 내장된 스크래핑 엔진을 통해 외부 서버 없이 빠르고 독립적으로 동작합니다.

(라고 AI가 써준 소개글. 이하는 덧붙인 글)

이 프로젝트는 본래 웹서버에서 동작시킬 용도로 스크래퍼 로직부터 만들어두고 방치하던걸 바이브 코딩으로 해보면 좀 쉽게 되려나로 시작된 개인 작업물입니다.
프로젝트 개발 툴은 Antigravity 이며, 거의 90%이상의 코드는 Gemini 에 의해 만들어진 코드입니다. 개인적으로는 Tauri를 첨 써보며 어떻게 사용하는건지 확인하는 차원의 프로젝트이기도 합니다.

<br>

## ✨ 주요 기능 (Key Features)

* **다양한 종류의 자산운용사 지원**
* **네이티브 기반 독립 실행 환경**: Rust/Tauri 아키텍처로 짜인 네이티브 환경 위에서 독립적으로 스크래핑 및 DB 관리를 수행해 처리 속도가 매우 빠르고 리소스 낭비가 적습니다.
* **손쉬운 일괄 업데이트 (Update All)**: 선택한 특정 날짜의 모든 ETF 포트폴리오 및 구성 종목 데이터를 버튼 클릭 한 번으로 수집(Update)할 수 있습니다.
* **포트폴리오 과거-현재 시점 비교**:
  * 선택된 기준 시점의 자산 구성과 특정 과거 시점의 구성을 대조 분석하여 비중의 증가/감소, 신규 편입 및 편출을 정밀하게 모니터링합니다.
* **대시보드 차트 시각화**: Apache ECharts를 도입하여 시계열 ETF 비중 데이터를 시각적이고 직관적인 차트로 표현하며, 매끄러운 툴팁과 필터링 인터랙션을 제공합니다.
* **관심 종목 (Favorites) & UX 연동**:
  * 자주 보는 ETF를 별 아이콘(★)으로 지정해 상단에 배치하고 금색으로 강조 표시할 수 있습니다.
  * 종목 테이블이나 로그 창에서 항목을 더블클릭하면 해당 ETF의 공식 웹페이지로 즉각 이동합니다.
* **Cloudflare 403 차단 우회**: Rust 기반 네이티브 비동기 스크래퍼를 통해 Cloudflare의 봇 방어 시스템을 우회하여 데이터를 수집합니다.

* **현재 지원하는 자산운용사**: KODEX, 타임폴리오, Koact, RISE, PLUS
  * 각 운용사별 Active ETF들의 경우 Time과 Koact는 전체, 그외는 주요 ETF들을 선별해서 추가해두었습니다. 추후 직접 추가하는 기능도 고려중입니다.
<br>

## 🛠 기술 스택 (Tech Stack)

### Frontend (User Interface)
* **Framework**: React 18, TypeScript, Vite
* **Styling & UI**: Tailwind CSS, Mantine UI
* **Charts**: Apache ECharts

### Backend & Data Pipeline
* **Framework**: Rust (Tauri)
* **Database**: SQLite (로컬 DB 인하우스 저장)
* **Data Scraper**: Rust 기반 네이티브 비동기 스크래퍼 통합 (Legacy Go Sidecar 의존 중단)

<br>

## ⚙️ 설치 가이드 (Installation)

이 프로젝트를 로컬에서 빌드하고 실행하려면 아래의 도구들이 시스템에 구성되어야 합니다.

* [Node.js](https://nodejs.org/) (v14 이상 권장)
* [Rust](https://rustup.rs/) (최신 Stable 버전) 및 C++ Build Tools (Windows) / Xcode Command Line Tools (macOS)

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
프로젝트 루트 디렉토리 안에 구성된 통합 스크립트를 활용해 프로덕션 버전을 렌더링하고 패키징합니다.
* **Windows 배포용 빌드 스크립트 실행 (PowerShell)**:
  ```powershell
  cd ../scripts
  .\build_release.ps1
  ```
  *(수동 빌드 시 `app` 폴더 내에서 `npm run tauri build`를 직접 실행할 수 있습니다.)*

<br>

## 📂 프로젝트 구조 (Directory Structure)

```text
.
├── app/                  # React 프론트엔드 최상위 디렉토리 및 UI 로직 (Vite)
│   ├── src/              # React 컴포넌트, 상태 관리 로직
│   └── src-tauri/        # Rust 백엔드 핵심 비즈니스 로직 및 Native Command API
├── scripts/              # 배포 및 빌드 관리 자동화 스크립트
├── sidecars/             # (Deprecated) 기존 Go 기반 스크래핑 사이드카 엔진 소스, Rust로 통합됨
└── README.md
```

<br>

