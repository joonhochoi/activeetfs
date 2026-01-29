# Active ETF Viewer 구현 계획 (관심 종목 기능)

## 목표 설명
사용자가 자주 보는 ETF를 '관심 종목(Favorite)'으로 지정하여 쉽게 식별할 수 있도록 합니다.
-   ETF 제목 옆에 별(Star) 아이콘을 두어 토글할 수 있게 합니다.
-   관심 종목으로 설정된 ETF는 사이드바 목록에서 눈에 띄는 색상으로 표시합니다.
-   설정 상태는 로컬 DB에 저장되어 앱 재시작 시에도 유지됩니다.

## 변경 제안

### 백엔드 (Rust)

#### [수정] [src-tauri/src/db.rs](file:///c:/Users/juno/project/activeetfs/app/src-tauri/src/db.rs)
-   **스키마 변경**: `etfs` 테이블에 `is_favorite` (BOOLEAN/INTEGER, Default 0) 컬럼 추가.
    -   기존 테이블이 있을 경우 `ALTER TABLE` 실행 (오류 무시 처리).
-   **데이터 시딩 로직 변경**:
    -   기존 `INSERT OR REPLACE`는 행을 삭제 후 다시 삽입하므로 `is_favorite` 값이 초기화되는 문제가 있음.
    -   이를 `INSERT INTO ... ON CONFLICT(code) DO UPDATE SET ...` 구문으로 변경하여, `is_favorite` 컬럼은 건드리지 않고 나머지 정보만 업데이트하도록 수정.

#### [수정] [src-tauri/src/commands.rs](file:///c:/Users/juno/project/activeetfs/app/src-tauri/src/commands.rs)
-   **New Command**: `toggle_etf_favorite(etf_code: String, is_favorite: bool)`
    -   DB의 `etfs` 테이블 업데이트.
-   **New Command**: `get_etfs_list` (또는 `get_favorite_etfs`)
    -   DB에서 현재 저장된 ETF 목록과 `is_favorite` 상태를 조회하여 반환.
    -   프론트엔드 초기 로딩 시 이 정보를 `activeetfinfos.json`와 병합하거나 상태를 동기화.

#### [수정] [src-tauri/src/lib.rs](file:///c:/Users/juno/project/activeetfs/app/src-tauri/src/lib.rs)
-   새로운 명령어 등록.

### 프론트엔드 (React)

#### [수정] [App.tsx](file:///c:/Users/juno/project/activeetfs/app/src/App.tsx)
-   **상태 관리**: `favorites` Set<string> (관심 종목 ETF 코드 집합).
-   **초기화**: 앱 실행 시 `get_favorite_etfs` 호출하여 `favorites` 상태 초기화.
-   **핸들러**: `toggleFavorite(code)` 함수 구현 -> 백엔드 호출 및 로컬 상태 업데이트.
-   `Layout`과 `Dashboard`에 `favorites` 및 `toggleFavorite` 전달.

#### [수정] [components/Layout.tsx](file:///c:/Users/juno/project/activeetfs/app/src/components/Layout.tsx)
-   사이드바 ETF 목록 렌더링 시, `favorites`에 포함된 코드는 스타일 변경.
    -   예: 텍스트 색상 변경 (노란색/금색) 또는 아이콘 추가.
    -   체크된 별 아이콘 표시.

#### [수정] [components/Dashboard.tsx](file:///c:/Users/juno/project/activeetfs/app/src/components/Dashboard.tsx)
-   헤더 영역(ETF 제목 앞)에 별 아이콘 추가.
    -   `favorites.has(etfCode)` 여부에 따라 꽉 찬 별(★) 또는 빈 별(☆) 표시.
    -   클릭 시 `toggleFavorite` 호출.

## Phase 2: Configuration Refactoring & Frontend Features

### Configuration & Sidecar Refactoring
#### [MODIFY] [activeetfinfos.json](file:///c:/Users/juno/project/activeetfs/app/src/data/activeetfinfos.json)
-   **Structure Change**: Move common arguments (like `--type`, `--id` prefix logic if applicable) to the `manager` level to reduce redundancy.
-   **Explicit Args**: Ensure `etf` args are minimal (just the specific code/id).

### Frontend (React)
#### [MODIFY] [Dashboard.tsx](file:///c:/Users/juno/project/activeetfs/app/src/components/Dashboard.tsx)
-   **Logic Update**: Update the `run_sidecar` call to construct arguments by combining `manager.common_args` (if added) and `etf.args`.
-   **New Feature**: Add `onDoubleClick` handler to the ETF name header `<h2>`.
    -   Find the current ETF's manager in `activeEtfInfos`.
    -   Get `manager.view_url`.
    -   Replace `{$}` with the ID value found in the ETF's arguments (parsing required).
    -   Use `tauri-plugin-opener` (or `shell.open`) to launch the URL.

### Log UI restoration
#### [MODIFY] [Dashboard.tsx](file:///c:/Users/juno/project/activeetfs/app/src/components/Dashboard.tsx)
-   **Modify `LogItem` interface**: Add optional `analysisData` field to store structured analysis results (In/Out lists).
-   **Update `handleAnalyze`**: Instead of formatting strings, pass raw `inStocks` and `outStocks` data to `addLog`.
-   **Update Log Rendering**:
    -   Create a specialized view for `type === 'analysis'`.
    -   Style matches "Analysis Complete" screenshot: dark card, accent border.
    -   Render "In" (Green) and "Out" (Red) sections.
    -   Make stock names clickable -> triggers `isolateSeries`.

### Chart Refinements
#### [MODIFY] [Dashboard.tsx](file:///c:/Users/juno/project/activeetfs/app/src/components/Dashboard.tsx)
-   **Default View Range**: Change default `viewStartDate` to `targetDate - 7 days` (1 week) instead of 1 month.
-   **Chart Series Logic**:
    -   Modify `seriesNames` calculation.
    -   Instead of `latestHoldings.filter...`, scan **all holdings within the Date Range**.
    -   Collect all unique series (stocks) that appeared at least once in the range.
    -   Sort by `max(weight)` or `latest weight` to respect `Top N` limit (will use `max` to ensure transient high-weight stocks are shown).
-   **Chart Interaction**:
    -   Enable `triggerEvent: true` on xAxis.
-   **Chart Interaction**:
    -   Enable `triggerEvent: true` on xAxis.
    -   **Tooltip**:
        -   `appendToBody: true` (Render outside chart DOM).
        -   **Remove Scroll**: Remove `max-height` and `overflow-y` to show full content per user request.
        -   **Sort Items**: Add `formatter` to sort items by value (weight) descending.
    -   **Layout Fix**:
        -   Change Chart `minHeight` to `550px` (User request).
        -   **ResizeObserver**: Keeps chart filling the space.
    -   **Tooltip**:
        -   Change `trigger` to `'item'` (Only show when hovering lines/points, not whitespace).
        -   **Fix Visibility**: Change `symbol: 'none'` to `'circle'`, `symbolSize: 8`, `itemStyle: { opacity: 0 }`. This makes points interactive (triggering tooltip) but invisible unless hovered (`emphasis: { opacity: 1 }`).
        -   **Formatter Update**: Since `trigger: 'item'` passes single point, use `params.name` (Date) to look up *all* holdings for that date from state, sort them, and display. This preserves the "Daily Summary" feature while satisfying the "No whitespace tooltip" constraint.
    -   **Log Panel**:
        -   **Keep Height 200px** (User preference).
        -   Use `container.scrollTop` instead of `scrollIntoView` to prevent page jumping.
    -   **Y-Axis**: Force integer values (`minInterval: 1`, `formatter: value => value.toFixed(0)`).
    -   **Sidebar**:
        -   Reduce ETF list font size to `0.8rem` (Done).
        -   **Icons**: Replace leading dot with Star for favorites (remove trailing star). Default to dot for non-favorites.
        -   **Header Font**: Reduce Manager Name font size to `0.75rem`.
     -   **Canvas Click**: Implement `getZr().on('click')` handler.
    -   **Bug Fixes**:
        -   **Calendar Reset**: Ensure calendar highlights (available dates) are cleared/reset immediately when switching ETFs, preventing "ghost" data from previous ETF.
        -   **Chart Interaction**: Investigate why chart clicks are unresponsive initially. Ensure `bindClickEvent` is called reliably on every needed update, or that the ZRender handler is attached correctly after initial render/resize.
        -   **Log Truncation**: Add padding-bottom to the log container or a spacer element to ensure the last log line is fully visible and not cut off by the container edge.
        -   **Default Collapsed Sidebar**: Initialize the sidebar with all manager sections collapsed (showing only manager names) instead of expanded.
        -   **Calendar Clipping**: Fix the date picker in the comparison table being clipped by the sidebar. Use `createPortal` for positioning and hide Saturday/Sunday columns via CSS as requested.

### Backend/Build
#### [NEW] [get_pdfs](file:///c:/Users/juno/project/activeetfs/sidecars/cmd/get_pdfs/main.go)
-   Build the Go sidecar and place it in `src-tauri/binaries` as `get_pdfs-x86_64-pc-windows-msvc.exe`.

#### [DELETE] Old Binaries
-   Delete `get_time-*.exe` and `get_koact-*.exe` from `src-tauri/binaries`.

## 검증 계획
### 수동 검증
-   대시보드에서 별 아이콘 클릭 시 토글되는지 확인 (UI 변경).
-   사이드바 목록에서 해당 ETF가 강조되는지 확인.
-   앱을 완전히 종료 후 다시 실행했을 때 설정 상태가 유지되는지 확인.
