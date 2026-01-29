# Build Release Script

# Define target triple
$targetTriple = "x86_64-pc-windows-msvc"
$binDir = "..\..\..\app\src-tauri\binaries"

# Function to build and copy sidecar
function Build-Sidecar {
    param (
        [string]$SidecarName
    )
    Write-Host "Building Sidecar ($SidecarName)..."
    Push-Location "..\sidecars\cmd\$SidecarName"
    
    go build -ldflags="-s -w" -o "$SidecarName.exe" main.go
    
    if (-not (Test-Path "$SidecarName.exe")) {
        Write-Error "Sidecar $SidecarName build failed!"
        Pop-Location
        exit 1
    }
    
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    }
    
    Copy-Item "$SidecarName.exe" -Destination "$binDir\$SidecarName-$targetTriple.exe" -Force
    Write-Host "   $SidecarName copied."
    Pop-Location
}

# 1. Build Sidecars
Build-Sidecar -SidecarName "get_time"
Build-Sidecar -SidecarName "get_koact"

Write-Host "3. Building Tauri App..."
Set-Location "..\app"
npm.cmd run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed!"
    exit 1
}

Write-Host "4. Copying Live Database for Portable Distribution..."
$appDataDB = "$env:APPDATA\com.juno.app\activeetf.db"
$releaseDir = "src-tauri\target\release"

if (Test-Path $appDataDB) {
    Copy-Item $appDataDB -Destination "$releaseDir\activeetf.db" -Force
    Write-Host "   activeetf.db copied from AppData to release folder."
}
else {
    Write-Warning "   Live database not found at $appDataDB. Skipping DB copy."
}

Write-Host "Build Complete!"
Write-Host "Executable and DB are located in: $PWD\$releaseDir"
