import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function findActiveServer() {
  const serversDir = path.join(os.homedir(), '.pixel-agents', 'servers');
  if (fs.existsSync(serversDir)) {
    try {
      const files = fs.readdirSync(serversDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const cfg = JSON.parse(fs.readFileSync(path.join(serversDir, file), 'utf-8'));
          if (cfg && cfg.port && cfg.token) {
            return { port: cfg.port, token: cfg.token };
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  const legacyFile = path.join(os.homedir(), '.pixel-agents', 'server.json');
  if (fs.existsSync(legacyFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'));
      if (cfg && cfg.port && cfg.token) {
        return { port: cfg.port, token: cfg.token };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
];

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
];

function findBrowserBinary() {
  for (const p of edgePaths) {
    if (fs.existsSync(p)) return p;
  }
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'msedge';
}

async function main() {
  let server = findActiveServer();
  if (!server) {
    console.log('Starting Pixel Agents server...');
    const serverProcess = spawn('node', ['dist/cli.js', '--port', '3100'], {
      cwd: path.resolve(import.meta.dirname, '.'),
      detached: true,
      stdio: 'ignore',
    });
    serverProcess.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      server = findActiveServer();
      if (server) break;
    }
  }

  const port = server?.port || 3100;
  const token = server?.token || '';
  const appUrl = `http://127.0.0.1:${port}/?token=${token}`;

  const bin = findBrowserBinary();
  console.log('========================================================');
  console.log('     Launching KiBee Pixel Agents Desktop Application   ');
  console.log('========================================================');
  console.log(`URL: ${appUrl}`);
  console.log(`Binary: ${bin}\n`);

  const args = [
    `--app=${appUrl}`,
    '--window-size=1280,800',
    '--window-position=100,100',
    `--user-data-dir=${path.join(os.homedir(), '.pixel-agents', 'app-profile')}`,
  ];

  const child = spawn(bin, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log('✅ Desktop App launched in standalone window!');
}

main().catch(console.error);
