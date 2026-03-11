import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const tauriConfPath = path.join(rootDir, 'app', 'src-tauri', 'tauri.conf.json');
const readmePath = path.join(rootDir, 'README.md');

function updateVersion() {
  try {
    // Read tauri.conf.json
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    const version = tauriConf.version;
    console.log(`Current version in tauri.conf.json: ${version}`);

    // Read README.md
    let readme = fs.readFileSync(readmePath, 'utf8');

    // 1. Update version badge: version-0.3.2-blue.svg
    readme = readme.replace(
      /badge\/version-[\d\.]+-blue\.svg/g,
      `badge/version-${version}-blue.svg`
    );

    // 2. Update download links: activeetfs_0.3.2_x64-setup.exe, activeetfs_0.3.2_universal.dmg
    // Windows setup
    readme = readme.replace(
      /activeetfs_[\d\.]+_x64-setup\.exe/g,
      `activeetfs_${version}_x64-setup.exe`
    );
    // macOS universal
    readme = readme.replace(
      /activeetfs_[\d\.]+_universal\.dmg/g,
      `activeetfs_${version}_universal.dmg`
    );

    // 3. Update screenshot image names: activeetfs_v0.3.2.png
    // readme = readme.replace(
    //   /activeetfs_v[\d\.]+\.png/g,
    //   `activeetfs_v${version}.png`
    // );

    // Write back to README.md
    fs.writeFileSync(readmePath, readme, 'utf8');
    console.log('Successfully updated README.md with new version info.');

  } catch (error) {
    console.error('Error updating version:', error);
    process.exit(1);
  }
}

updateVersion();
