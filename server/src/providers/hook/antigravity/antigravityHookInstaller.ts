import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { HOOK_SCRIPTS_DIR } from '../../../constants.js';

const ANTIGRAVITY_HOOK_SCRIPT_NAME = 'antigravity-hook.js';

function getHookScriptPath(): string {
  return path.join(os.homedir(), HOOK_SCRIPTS_DIR, ANTIGRAVITY_HOOK_SCRIPT_NAME);
}

function getGeminiConfigDir(): string {
  return path.join(os.homedir(), '.gemini', 'config');
}

function getPluginDir(): string {
  return path.join(getGeminiConfigDir(), 'plugins', 'kibee-pixel-agents');
}

function getPluginHooksJsonPath(): string {
  return path.join(getPluginDir(), 'hooks.json');
}

function getGeminiConfigJsonPath(): string {
  return path.join(getGeminiConfigDir(), 'config.json');
}

export async function installHooks(packageRoot?: string): Promise<void> {
  // 1. Ensure ~/.pixel-agents/hooks/ exists
  const hooksDir = path.join(os.homedir(), HOOK_SCRIPTS_DIR);
  fs.mkdirSync(hooksDir, { recursive: true });

  const destScriptPath = getHookScriptPath();

  // 2. Copy compiled antigravity-hook.js if packageRoot is provided
  if (packageRoot) {
    const src = path.join(packageRoot, 'dist', 'hooks', ANTIGRAVITY_HOOK_SCRIPT_NAME);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, destScriptPath);
    }
  }

  // 3. Configure plugin in ~/.gemini/config/plugins/kibee-pixel-agents/hooks.json
  const pluginDir = getPluginDir();
  fs.mkdirSync(pluginDir, { recursive: true });

  // Escape backslashes for JSON command on Windows
  const safeScriptPath = destScriptPath.replace(/\\/g, '\\\\');
  const command = `node "${safeScriptPath}" ; exit 0`;

  const hooksConfig = {
    'kibee-pixel-agents': {
      enabled: true,
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command,
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
              command,
              timeout: 15,
            },
          ],
        },
      ],
      PreInvocation: [
        {
          type: 'command',
          command,
          timeout: 15,
        },
      ],
      PostInvocation: [
        {
          type: 'command',
          command,
          timeout: 15,
        },
      ],
      Stop: [
        {
          type: 'command',
          command,
          timeout: 15,
        },
      ],
    },
  };

  fs.writeFileSync(getPluginHooksJsonPath(), JSON.stringify(hooksConfig, null, 2), 'utf-8');

  // 4. Ensure plugin is enabled in ~/.gemini/config/config.json
  const configJsonPath = getGeminiConfigJsonPath();
  if (fs.existsSync(configJsonPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const plugins = (config.plugins || {}) as Record<string, unknown>;
      plugins['kibee-pixel-agents'] = { enabled: true };
      config.plugins = plugins;
      fs.writeFileSync(configJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch {
      /* ignore */
    }
  }
}

export async function uninstallHooks(): Promise<void> {
  const hooksJson = getPluginHooksJsonPath();
  if (fs.existsSync(hooksJson)) {
    try {
      const config = JSON.parse(fs.readFileSync(hooksJson, 'utf-8')) as Record<string, unknown>;
      const plugin = config['kibee-pixel-agents'] as Record<string, unknown> | undefined;
      if (plugin) {
        plugin.enabled = false;
        fs.writeFileSync(hooksJson, JSON.stringify(config, null, 2), 'utf-8');
      }
    } catch {
      /* ignore */
    }
  }

  const configJsonPath = getGeminiConfigJsonPath();
  if (fs.existsSync(configJsonPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configJsonPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const plugins = (config.plugins || {}) as Record<string, unknown>;
      if (plugins['kibee-pixel-agents']) {
        plugins['kibee-pixel-agents'] = { enabled: false };
        config.plugins = plugins;
        fs.writeFileSync(configJsonPath, JSON.stringify(config, null, 2), 'utf-8');
      }
    } catch {
      /* ignore */
    }
  }
}

export function areHooksInstalled(): boolean {
  const hooksJson = getPluginHooksJsonPath();
  if (!fs.existsSync(hooksJson)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(hooksJson, 'utf-8')) as Record<string, unknown>;
    const plugin = config['kibee-pixel-agents'] as { enabled?: boolean } | undefined;
    return plugin?.enabled === true;
  } catch {
    return false;
  }
}
