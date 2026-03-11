# 📈 Active ETFs

![Active ETFs](https://img.shields.io/badge/version-0.3.2-blue.svg)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![macOS](https://img.shields.io/badge/macOS-Universal-black.svg)

**Active ETFs**는 국내 다양한 자산운용사의 ETF(상장지수펀드) PDF(Portfolio Deposit File) 구성과 비중 변화를 손쉽게 수집하고, 직관적으로 시각화 및 비교 분석할 수 있는 **데스크톱 애플리케이션**입니다.

과거 내역과 현재 내역을 달력을 통해 대조하여 포트폴리오의 신규 편입과 편출 및 비중 변화를 한눈에 파악할 수 있으며, 자체 내장된 스크래핑 엔진을 통해 외부 서버 없이 빠르고 독립적으로 동작합니다.

(라고 AI가 써준 소개글. 이하는 덧붙인 글)

이 프로젝트는 본래 웹서버에서 동작시킬 용도로 스크래퍼 로직부터 만들어두고 방치하던걸 바이브 코딩으로 해보면 좀 쉽게 되려나로 시작된 개인 작업물입니다.
프로젝트 개발 툴은 Antigravity 이며, 거의 90%이상의 코드는 Gemini+Opus 에 의해 만들어진 코드입니다. 개인적으로는 Tauri를 첨 써보며 어떻게 사용하는건지 확인하는 차원의 프로젝트이기도 합니다.

* **Windows 용 설치 파일**: [다운로드](https://github.com/joonhochoi/activeetfs/releases/latest/download/activeetfs_0.3.2_x64-setup.exe)
  * 최초 설치 시 "Windows의 PC 보호" 혹은 macOS의 "확인되지 않은 개발자" 경고가 뜰 수 있습니다. 이는 개인 개발자 배포 정책에 의한 것으로 안전하오니 안내에 따라 실행해 주세요. 
  * 이후 업데이트는 앱 시작 시 자동으로 체크하여 무중단 업데이트를 수행합니다.
* **macOS 용 설치 파일 (Universal)**: [다운로드](https://github.com/joonhochoi/activeetfs/releases/latest/download/activeetfs_0.3.2_universal.dmg)


<br>

<img src="https://github.com/joonhochoi/activeetfs/blob/main/img/activeetfs_v0.3.1.png" width="980" alt="v0.3.1 스크린샷" />

## ✨ 주요 기능 (Key Features)

* **다양한 자산운용사 지원**: KODEX, 타임폴리오, Koact, RISE, PLUS 등 주요 운용사의 Active ETF를 지원하며 종목 리스트를 지속적으로 확장 중입니다.
* **네이티브 기반 독립 실행 (Tauri v2)**: Rust와 Tauri v2 아키텍처를 기반으로 백엔드가 구성되어 빠른 실행 속도와 낮은 리소스 점유율을 자랑합니다.
* **무중단 자동 업데이트**: GitHub Actions를 통한 CI/CD 파이프라인이 구축되어 있어, 새로운 버전이 출시될 때마다 앱 시작 시 자동으로 감지하고 간편하게 업데이트할 수 있습니다.
* **강력한 데이터 스크래핑**: 
  * **안티봇 우회**: Cloudflare 보안 챌린지를 네이티브 WebView를 활용해 우회하여 데이터를 수집합니다.
  * **일괄 업데이트 (Update All)**: 캘린더를 통해 하루 혹은 여러 날짜의 데이터를 한 번의 클릭으로 자동 수집할 수 있습니다.
  * **한글 인코딩 최적화**: 특정 운용사에서 발생하는 인코딩(Mojibake) 문제를 해결하여 정확한 한글 데이터를 제공합니다.
* **포트폴리오 과거-현재 대조 분석**:
  * 선택한 기준일과 과거 시점의 포트폴리오를 비교하여 신규 편입(NEW), 비중 증감 등을 명확하게 시각화합니다.
* **인터랙티브 대시보드 (ECharts)**:
  * Apache ECharts를 활용해 시계열 비중 변화를 시각화합니다. 
  * **확대/축소(Zoom)** 기능을 지원하여 세밀한 비중 변화를 시점별로 추적할 수 있습니다.
* **사용자 편의성 (UX)**:
  * **관심 종목 (Favorites)**: 자주 보는 ETF를 별 아이콘(★)으로 즐겨찾기하고 상단에 고정할 수 있습니다.
  * **상세 페이지 연동**: 종목명을 더블클릭하면 해당 상품의 공식 웹사이트로 바로 연결됩니다.
<br>

## 🛠 기술 스택 (Tech Stack)

### Frontend (User Interface)
* **Framework**: React 18, TypeScript, Vite
* **Styling & UI**: Tailwind CSS, Mantine UI
* **Charts**: Apache ECharts

### Backend & Data Pipeline
* **Framework**: Rust (**Tauri v2**)
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
├── app/                  # Tauri v2 기반 애플리케이션 (React + Rust)
│   ├── src/              # 프론트엔드 UI (React, TypeScript)
│   └── src-tauri/        # 백엔드 핵심 비즈니스 로직 (Rust)
├── scripts/              # 배포 및 빌드 자동화 스크립트
├── img/                  # 스크린샷 등 미디어 자산
└── README.md
```

<br>

