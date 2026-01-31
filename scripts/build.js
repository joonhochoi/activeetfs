const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Configuration
const SIDECARS = ['get_pdfs'];
const APP_DIR = path.resolve(__dirname, '../app');
const BIN_DIR = path.resolve(APP_DIR, 'src-tauri/binaries');
const SIDECAR_ROOT = path.resolve(__dirname, '../sidecars/cmd');

// Determine Target Triple
function getTargetTriple() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'win32') {
        return 'x86_64-pc-windows-msvc';
    } else if (platform === 'darwin') {
        return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    } else {
        // Linux or others (extend if needed)
        return 'x86_64-unknown-linux-gnu';
    }
}

const targetTriple = getTargetTriple();
console.log(`Target Triple: ${targetTriple}`);

// Ensure Binaries Directory Exists
if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
}

// 1. Build Sidecars (Skipped for release build as per user request)
/*
console.log('\n--- Building Sidecars ---');
for (const sidecar of SIDECARS) {
    const sidecarPath = path.join(SIDECAR_ROOT, sidecar);
    console.log(`Building ${sidecar}...`);

    try {
        // Determine output filename
        const isWin = os.platform() === 'win32';
        const binaryName = isWin ? `${sidecar}.exe` : sidecar;
        const targetName = isWin ? `${sidecar}-${targetTriple}.exe` : `${sidecar}-${targetTriple}`;

        // Build
        execSync(`go build -ldflags="-s -w" -o "${binaryName}" main.go`, {
            cwd: sidecarPath,
            stdio: 'inherit'
        });

        // Copy to Binaries Dir
        const source = path.join(sidecarPath, binaryName);
        const destination = path.join(BIN_DIR, targetName);

        fs.copyFileSync(source, destination);
        console.log(`   Copied to ${destination}`);
    } catch (error) {
        console.error(`Error building ${sidecar}:`, error);
        process.exit(1);
    }
}
*/

// 2. Prepare Live Database for Bundle
let tempDbPath = null;
console.log('\n--- Preparing Database for Bundle ---');
// Use the development database from target/debug if available
const debugDbPath = path.join(APP_DIR, 'src-tauri', 'target', 'debug', 'activeetf.db');
const targetDbPath = path.join(APP_DIR, 'src-tauri', 'activeetf.db');

if (fs.existsSync(debugDbPath)) {
    try {
        console.log(`   Found dev DB at: ${debugDbPath}`);
        // Copy to src-tauri root so it can be picked up by "resources": ["activeetf.db"]
        fs.copyFileSync(debugDbPath, targetDbPath);
        tempDbPath = targetDbPath;
        console.log(`   Copied to build context: ${targetDbPath}`);
    } catch (e) {
        console.warn(`   Failed to prepare DB: ${e.message}`);
    }
} else {
    console.log('   No development database found in target/debug (Skipping).');
}

// 3. Build Tauri App
console.log('\n--- Building Tauri App ---');
try {
    const npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
    execSync(`${npmCmd} run tauri build`, {
        cwd: APP_DIR,
        stdio: 'inherit'
    });
} catch (error) {
    console.error('Tauri build failed:', error);
    process.exit(1);
}

// Cleanup logic removed to persist DB for dev mode
if (tempDbPath) {
    console.log(`\n--- Note: DB file persisted at ${tempDbPath} for dev mode ---`);
}

console.log('\n✅ Build Complete!');
