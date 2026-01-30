# 프로젝트 설치 및 실행 가이드

이 프로젝트는 **React (Frontend)**, **Rust (Tauri Backend)**, **Go (Sidecars)** 기술 스택으로 구성된 데스크톱 애플리케이션입니다.

## 1. 개발 환경 설정 (Prerequisites)

이 프로젝트를 빌드하고 실행하기 위해서는 아래 도구들이 설치되어 있어야 합니다.

### 공통 필수 도구
*   **Node.js** (v18 이상 권장) 및 **npm**
*   **Rust** (최신 Stable 버전)
    *   설치: [https://rustup.rs/](https://rustup.rs/)
*   **Go** (v1.20 이상 권장, 사이드카 빌드용)
    *   설치: [https://go.dev/dl/](https://go.dev/dl/)

### 운영체제별 추가 요구사항

#### Windows
*   **Visual Studio C++ Build Tools**
    *   설치 시 'C++를 사용한 데스크톱 개발' 워크로드 체크 필수

#### macOS
*   **Xcode Command Line Tools**
    *   터미널에서 `xcode-select --install` 실행

---

## 2. 프로젝트 초기 설정 (Setup)

터미널을 열고 프로젝트 루트 폴더에서 아래 명령어들을 순서대로 실행합니다.

1.  **의존성 패키지 설치**
    ```bash
    cd app
    npm install
    ```

---

## 3. 사이드카(Sidecar) 빌드 및 배치

Tauri 앱은 외부 Go 프로그램(`get_pdfs` 등)을 실행하여 데이터를 수집합니다. 실행 전 반드시 이 파일들을 빌드하여 올바른 위치(`app/src-tauri/binaries`)에 배치해야 합니다.

*   대상 사이드카: `sidecars/cmd/` 폴더 내의 프로그램들 (예: `get_pdfs`, `get_koact` 등)
*   타겟 위치: `app/src-tauri/binaries/`
*   파일명 규칙: `실행파일명-타겟트리플.확장자`
    *   Windows: `get_pdfs-x86_64-pc-windows-msvc.exe`
    *   macOS (Intel): `get_pdfs-x86_64-apple-darwin`
    *   macOS (Apple Silicon): `get_pdfs-aarch64-apple-darwin`

### Windows (PowerShell) 수동 설정 예시
```powershell
# 1. 사이드카 디렉토리로 이동
cd sidecars/cmd/get_pdfs

# 2. Go 빌드
go build -o get_pdfs.exe

# 3. Binaries 폴더 생성 (없을 경우)
New-Item -ItemType Directory -Force -Path "..\..\..\app\src-tauri\binaries"

# 4. Tauri 바이너리 규칙에 맞춰 복사
Copy-Item get_pdfs.exe -Destination "..\..\..\app\src-tauri\binaries\get_pdfs-x86_64-pc-windows-msvc.exe"
```

### macOS 수동 설정 예시 (Apple Silicon 기준)
```bash
# 1. 사이드카 디렉토리로 이동
cd sidecars/cmd/get_pdfs

# 2. Go 빌드
go build -o get_pdfs

# 3. Binaries 폴더 생성
mkdir -p ../../../app/src-tauri/binaries

# 4. 복사 (Apple Silicon: aarch64, Intel: x86_64)
cp get_pdfs ../../../app/src-tauri/binaries/get_pdfs-aarch64-apple-darwin
```
> **참고**: `get_koact` 등 다른 사이드카도 동일한 방식으로 작업이 필요할 수 있습니다.

---

## 4. 개발 모드 실행 (Development)

개발 모드에서는 핫 리로딩(HMR)이 지원됩니다.

```bash
cd app
npm run tauri dev
```
*   명령어 실행 시 Frontend(Vite)와 Backend(Tauri)가 동시에 실행되며, 새로운 창이 열립니다.

---

### Windows 및 macOS 공통 (자동 빌드)

Node.js 환경에서 동작하는 통합 빌드 스크립트를 제공합니다. 이 스크립트는 운영체제를 자동 감지하여 아래 작업을 수행합니다.
1.  사이드카(Go) 빌드 및 타겟 아키텍처에 맞는 네이밍/배치
2.  Tauri 앱 빌드
3.  (Windows의 경우) 기존 데이터베이스 파일(ActiveETF.db) 포함 처리

**사용 방법**
1.  터미널에서 `app` 폴더로 이동합니다.
    ```bash
    cd app
    ```
2.  아래 명령어를 실행합니다.
    ```bash
    npm run build:release
    ```

**결과물 확인**
*   Windows: `app/src-tauri/target/release/bundle/msi/`
*   macOS: `app/src-tauri/target/release/bundle/dmg/`

> **참고**: 만약 스크립트 실행 중 권한 문제가 발생한다면 터미널을 관리자 권한으로 실행해 보세요. 수동 빌드가 필요한 경우 아래 '수동 빌드' 섹션을 참고하세요.

### 수동 빌드 (옵션)
스크립트를 사용하지 않고 직접 빌드해야 할 경우 아래 절차를 따릅니다.

1.  **사이드카 빌드 및 배치**: 위 '3. 사이드카 빌드 및 배치' 과정을 먼저 완료하세요.
2.  **앱 빌드**:
    ```bash
    cd app
    npm run tauri build
    ```

