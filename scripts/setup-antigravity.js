import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const HOOKS_DIR = path.join(os.homedir(), '.pixel-agents', 'hooks');
fs.mkdirSync(HOOKS_DIR, { recursive: true });

const srcHook = path.join(projectRoot, 'dist', 'hooks', 'antigravity-hook.js');
const dstHook = path.join(HOOKS_DIR, 'antigravity-hook.js');

if (fs.existsSync(srcHook)) {
  fs.copyFileSync(srcHook, dstHook);
  console.log(`✓ Copied antigravity-hook.js to: ${dstHook}`);
} else {
  console.error(`✗ Source hook not found at ${srcHook}. Run npm run build first.`);
  process.exit(1);
}

// Ensure Antigravity plugins directory exists
const geminiConfigDir = path.join(os.homedir(), '.gemini', 'config');
const pluginDir = path.join(geminiConfigDir, 'plugins', 'kibee-pixel-agents');
fs.mkdirSync(pluginDir, { recursive: true });

const safeDstPath = dstHook.replace(/\\/g, '\\\\');
const hookCmd = `node "${safeDstPath}" ; exit 0`;

const hooksConfig = {
  'kibee-pixel-agents': {
    enabled: true,
    PreToolUse: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: hookCmd,
            timeout: 15,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: '*',
        hooks: [
          {
            type: 'command',
            command: hookCmd,
            timeout: 15,
          },
        ],
      },
    ],
  },
};

const hooksJsonPath = path.join(pluginDir, 'hooks.json');
fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2), 'utf-8');
console.log(`✓ Configured Antigravity hook at: ${hooksJsonPath}`);

// Also ensure enabled in config.json
const configJsonPath = path.join(geminiConfigDir, 'config.json');
if (fs.existsSync(configJsonPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8'));
    cfg.plugins = cfg.plugins || {};
    cfg.plugins['kibee-pixel-agents'] = { enabled: true };
    fs.writeFileSync(configJsonPath, JSON.stringify(cfg, null, 2), 'utf-8');
    console.log(`✓ Enabled plugin 'kibee-pixel-agents' in: ${configJsonPath}`);
  } catch (e) {
    console.warn(`! Could not update config.json: ${e.message}`);
  }
}

console.log('\n[SUCCESS] Antigravity CLI and IDE are now wired to KiBee Pixel Agents Office!');
