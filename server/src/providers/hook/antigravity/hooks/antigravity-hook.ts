import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import {
  HOOK_API_PREFIX,
  SERVER_JSON_DIR,
  SERVER_JSON_NAME,
  SERVERS_DIR,
} from '../../../../constants.js';
import type { ServerConfig, ServerTarget } from '../../../../serverConfig.js';
import { isServerConfig, isServerTarget } from '../../../../serverConfig.js';

const SERVER_JSON = path.join(os.homedir(), SERVER_JSON_DIR, SERVER_JSON_NAME);
const SERVERS_REGISTRY_DIR = path.join(os.homedir(), SERVER_JSON_DIR, SERVERS_DIR);

let debugLogPath = process.env['PIXEL_AGENTS_DEBUG_LOG'];
function hookDebug(line: string): void {
  if (!debugLogPath) return;
  try {
    fs.appendFileSync(debugLogPath, `${new Date().toISOString()} AGY_HOOK ${line}\n`);
  } catch {
    /* ignore */
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRegistry(): ServerConfig[] {
  let files: string[];
  try {
    files = fs.readdirSync(SERVERS_REGISTRY_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const live: ServerConfig[] = [];
  for (const file of files) {
    const filePath = path.join(SERVERS_REGISTRY_DIR, file);
    try {
      const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
      if (!isServerConfig(entry)) continue;
      if (isProcessAlive(entry.pid)) {
        live.push(entry);
      }
    } catch {
      /* ignore */
    }
  }
  return live;
}

function readLegacyServerJson(): ServerTarget | null {
  try {
    const entry = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf-8')) as unknown;
    if (isServerTarget(entry) && isProcessAlive(entry.pid)) {
      return entry;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function postToServer(server: ServerTarget, body: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: server.port,
          path: `${HOOK_API_PREFIX}/antigravity`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            Authorization: `Bearer ${server.token}`,
          },
          timeout: 1500,
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on('error', () => resolve());
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
      req.end(body);
    } catch {
      resolve();
    }
  });
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    process.stdin.on('error', () => {
      resolve(data);
    });
    setTimeout(() => resolve(data), 500);
  });
}

async function main(): Promise<void> {
  try {
    const rawInput = (await readStdin()).trim();
    let parsed: Record<string, unknown> = {};
    if (rawInput) {
      try {
        parsed = JSON.parse(rawInput) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    // Extract Antigravity toolCall / hook info
    const preArgs = parsed.preToolHookArgs as Record<string, unknown> | undefined;
    const postArgs = parsed.postToolHookArgs as Record<string, unknown> | undefined;
    const toolCall = (preArgs?.toolCall || postArgs?.toolCall) as
      Record<string, unknown> | undefined;

    let toolName =
      (toolCall?.name as string) ||
      (parsed.tool_name as string) ||
      (parsed.toolName as string) ||
      '';

    let toolInput =
      (toolCall?.args as Record<string, unknown>) ||
      (parsed.tool_input as Record<string, unknown>) ||
      (parsed.toolInput as Record<string, unknown>) ||
      {};

    const sessionId =
      (parsed.conversationId as string) ||
      (parsed.conversation_id as string) ||
      (parsed.session_id as string) ||
      (parsed.sessionId as string) ||
      'antigravity-session';

    const cwd = (parsed.cwd as string) || (preArgs?.cwd as string) || process.cwd();

    let hookEventName = 'PreToolUse';
    if (parsed.terminationReason !== undefined || parsed.executionNum !== undefined) {
      hookEventName = 'Stop';
    } else if (parsed.invocationNum !== undefined) {
      hookEventName = 'PreInvocation';
      if (!toolName) {
        toolName = 'speak';
        toolInput = { message: 'Processing prompt...' };
      }
    } else if (postArgs || parsed.hook_event_name === 'PostToolUse') {
      hookEventName = 'PostToolUse';
    } else if (parsed.hook_event_name) {
      hookEventName = parsed.hook_event_name as string;
    }

    const payload = JSON.stringify({
      session_id: sessionId,
      hook_event_name: hookEventName,
      tool_name: toolName,
      tool_input: toolInput,
      awaiting_input: hookEventName === 'Stop',
      cwd,
      raw: parsed,
    });

    hookDebug(`dispatching event=${hookEventName} tool=${toolName} sid=${sessionId.slice(0, 8)}`);

    const registry = readRegistry();
    const targets: ServerTarget[] = registry.length > 0 ? registry : [];
    if (targets.length === 0) {
      const legacy = readLegacyServerJson();
      if (legacy) targets.push(legacy);
    }

    if (targets.length > 0) {
      await Promise.allSettled(targets.map((target) => postToServer(target, payload)));
    }
  } catch (err) {
    hookDebug(`error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    // Antigravity hook decision response:
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    process.exit(0);
  }
}

main();
