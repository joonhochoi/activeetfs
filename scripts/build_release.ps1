# Build Release Script

Write-Host "Building Tauri App..."
Set-Location "..\app"
npm.cmd run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed!"
    exit 1
}

$releaseDir = "src-tauri\target\release"

Write-Host "Build Complete!"
Write-Host "Executable is located in: $PWD\$releaseDir"
