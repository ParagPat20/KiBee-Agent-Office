import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgentEvent, HookProvider } from '../../../../../core/src/provider.js';
import {
  BASH_COMMAND_DISPLAY_MAX_LENGTH,
} from '../../../constants.js';
import {
  areHooksInstalled as installerAreHooksInstalled,
  installHooks as installerInstallHooks,
  uninstallHooks as installerUninstallHooks,
} from './antigravityHookInstaller.js';

export function formatToolStatus(toolName: string, input?: unknown): string {
  const inp = (input ?? {}) as Record<string, unknown>;
  const base = (p: unknown) => (typeof p === 'string' ? path.basename(p) : '');

  switch (toolName) {
    case 'run_command': {
      const cmd = (inp.CommandLine as string) || (inp.command as string) || '';
      return `Running: ${cmd.length > BASH_COMMAND_DISPLAY_MAX_LENGTH ? cmd.slice(0, BASH_COMMAND_DISPLAY_MAX_LENGTH) + '\u2026' : cmd}`;
    }
    case 'view_file':
      return `Reading ${base(inp.AbsolutePath || inp.filePath || inp.path)}`;
    case 'replace_file_content':
    case 'multi_replace_file_content':
      return `Editing ${base(inp.TargetFile || inp.filePath || inp.path)}`;
    case 'write_to_file':
      return `Writing ${base(inp.TargetFile || inp.filePath || inp.path)}`;
    case 'list_dir':
      return `Listing ${base(inp.DirectoryPath || inp.path)}`;
    case 'grep_search': {
      const q = (inp.Query as string) || '';
      return q ? `Searching code: ${q}` : 'Searching code';
    }
    case 'speak':
    case 'say':
    case 'chat':
    case 'reply': {
      const msg = (inp.message as string) || (inp.text as string) || (inp.content as string) || '';
      return msg ? `"${msg.length > 50 ? msg.slice(0, 50) + '…' : msg}"` : 'Responding...';
    }
    case 'order_workers': {
      const order = (inp.order as string) || (inp.instruction as string) || '';
      return order ? `Boss: ${order.length > 50 ? order.slice(0, 50) + '…' : order}` : 'Boss ordering team';
    }
    case 'delegate_task':
    case 'assign_task': {
      const task = (inp.task as string) || (inp.action as string) || '';
      return task ? `Assigning: ${task}` : 'Assigning task';
    }
    case 'think': {
      const thought = (inp.thought as string) || (inp.reasoning as string) || '';
      return thought ? `Planning: ${thought}` : 'Strategizing with Gemini...';
    }
    case 'search_web': {
      const q = (inp.query as string) || '';
      return q ? `Searching web: ${q}` : 'Searching web';
    }
    case 'read_url_content':
      return 'Fetching web content';
    case 'ask_question':
      return 'Waiting for your answer';
    case 'browser_subagent':
      return 'Browsing web';
    case 'generate_image':
      return 'Generating image';
    case 'manage_task':
      return 'Managing background task';
    case 'schedule':
      return 'Scheduling task';
    default:
      return `Using ${toolName}`;
  }
}

function normalizeHookEvent(
  raw: Record<string, unknown>,
): { sessionId: string; event: AgentEvent } | null {
  const eventName = raw.hook_event_name;
  const sessionId = raw.session_id;
  if (typeof eventName !== 'string' || typeof sessionId !== 'string') return null;

  switch (eventName) {
    case 'PreToolUse': {
      const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : '';
      const toolInput =
        typeof raw.tool_input === 'object' && raw.tool_input !== null
          ? (raw.tool_input as Record<string, unknown>)
          : {};

      if (toolName === 'ask_question') {
        return {
          sessionId,
          event: { kind: 'permissionRequest' },
        };
      }

      return {
        sessionId,
        event: {
          kind: 'toolStart',
          toolId: `hook-agy-${Date.now()}`,
          toolName,
          input: toolInput,
        },
      };
    }

    case 'PostToolUse':
      return { sessionId, event: { kind: 'toolEnd', toolId: 'current' } };

    case 'Stop': {
      const awaitingInput = raw.awaiting_input === true || raw.notification_type === 'idle_prompt';
      return { sessionId, event: { kind: 'turnEnd', awaitingInput } };
    }

    case 'Notification': {
      if (raw.notification_type === 'idle_prompt' || raw.awaiting_input === true) {
        return { sessionId, event: { kind: 'turnEnd', awaitingInput: true } };
      }
      return { sessionId, event: { kind: 'permissionRequest' } };
    }

    case 'SessionStart':
      return {
        sessionId,
        event: {
          kind: 'sessionStart',
          source: typeof raw.source === 'string' ? raw.source : undefined,
          transcriptPath: typeof raw.transcript_path === 'string' ? raw.transcript_path : undefined,
          cwd: typeof raw.cwd === 'string' ? raw.cwd : undefined,
        },
      };

    case 'SessionEnd':
      return {
        sessionId,
        event: {
          kind: 'sessionEnd',
          reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        },
      };

    default:
      return null;
  }
}

async function installHooks(): Promise<void> {
  // Find project root
  let current = __dirname;
  while (current && !fs.existsSync(path.join(current, 'package.json'))) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  await installerInstallHooks(current);
}

async function uninstallHooks(): Promise<void> {
  await installerUninstallHooks();
}

function areHooksInstalled(): Promise<boolean> {
  return Promise.resolve(installerAreHooksInstalled());
}

function consentDisclosure(): { headline: string; disclosure: string } {
  return {
    headline: 'Enable Antigravity / Gemini CLI Tracking',
    disclosure:
      'Pixel Agents will register hook triggers in ~/.gemini/config/plugins/kibee-pixel-agents/hooks.json. ' +
      'Whenever an Antigravity agent executes a tool, status events are sent to your local office server.',
  };
}

function getSessionDirs(_workspacePath: string): string[] {
  const brainDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain');
  if (fs.existsSync(brainDir)) return [brainDir];
  return [];
}

function getAllSessionRoots(): string[] {
  const brainDir = path.join(os.homedir(), '.gemini', 'antigravity-ide', 'brain');
  return fs.existsSync(brainDir) ? [brainDir] : [];
}

function parseTranscriptLine(line: string): AgentEvent | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const type = parsed.type as string;
    const status = parsed.status as string;

    if (type === 'PLANNER_RESPONSE') {
      const toolCalls = parsed.tool_calls as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const first = toolCalls[0];
        const name = (first.name as string) || '';
        const args = (first.args as Record<string, unknown>) || {};
        return {
          kind: 'toolStart',
          toolId: `agy-step-${parsed.step_index || Date.now()}`,
          toolName: name,
          input: args,
        };
      }
      if (status === 'DONE') {
        return { kind: 'turnEnd' };
      }
    } else if (type === 'USER_INPUT') {
      return { kind: 'turnEnd', awaitingInput: false };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildLaunchCommand(
  _sessionId: string,
  cwd: string,
  opts?: { bypassPermissions?: boolean },
): { command: string; args: string[]; env?: Record<string, string> } {
  const args: string[] = ['--effort', 'medium'];
  if (opts?.bypassPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  const env: Record<string, string> = {
    PWD: cwd,
  };
  if (process.env.GEMINI_API_KEY) {
    env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  }
  if (process.env.GOOGLE_API_KEY) {
    env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  }
  return { command: 'agy', args, env };
}

export const antigravityProvider: HookProvider = {
  kind: 'hook',
  id: 'antigravity',
  displayName: 'Google Antigravity / Gemini',
  protocolVersion: 1,

  normalizeHookEvent,
  installHooks,
  uninstallHooks,
  areHooksInstalled,
  consentDisclosure,

  formatToolStatus,
  permissionExemptTools: new Set(['ask_question', 'view_file', 'list_dir']),
  subagentToolNames: new Set(['browser_subagent', 'invoke_subagent']),
  readingTools: new Set(['view_file', 'grep_search', 'read_url_content', 'list_dir', 'search_web']),
  terminalNamePrefix: 'AGY',

  getSessionDirs,
  getAllSessionRoots,
  sessionFilePattern: 'transcript*.jsonl',
  parseTranscriptLine,
  buildLaunchCommand,
};
