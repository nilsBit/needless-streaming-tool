import { app, BrowserWindow } from 'electron';
import https from 'https';

const REPO = 'nilsBit/needless-streaming-tool';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  name: string;
}

function compareVersions(current: string, latest: string): boolean {
  const c = current.replace(/^v/, '').split('.').map(Number);
  const l = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export function checkForUpdates(mainWindow: BrowserWindow): void {
  const currentVersion = app.getVersion();

  const req = https.get(API_URL, { headers: { 'User-Agent': 'NST-Update-Check' } }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) return;
        const release: GitHubRelease = JSON.parse(data);
        if (compareVersions(currentVersion, release.tag_name)) {
          console.log(`[Update] New version available: ${release.tag_name} (current: ${currentVersion})`);
          mainWindow.webContents.send('update-available', {
            version: release.tag_name.replace(/^v/, ''),
            url: release.html_url,
            name: release.name,
          });
        } else {
          console.log(`[Update] Up to date (${currentVersion})`);
        }
      } catch {}
    });
  });

  req.on('error', () => {}); // Silent fail — no internet is fine
  req.end();
}
