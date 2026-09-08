import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

import type { AgentStateStore } from './agentStateStore.js';
import type { HttpServerOptions } from './httpServer.js';
import { writeLayoutToFile } from './layoutPersistence.js';

export interface DecomposedTask {
  employee: string;
  action: string;
  tool: string;
  detail: string;
  fileName?: string;
  targetPath?: string;
  code?: string;
  command?: string;
}

export interface TeamMemberInfo {
  id: number;
  sessionId: string;
  name: string;
  role: string;
  isBoss: boolean;
  isWaiting: boolean;
  status: string;
}

export function getGeminiApiKey(): string {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 5) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.length > 5) return process.env.GOOGLE_API_KEY;

  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)=(.*)$/m);
        if (match && match[1]?.trim()) {
          const key = match[1].trim().replace(/^['"]|['"]$/g, '');
          process.env.GEMINI_API_KEY = key;
          return key;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return '';
}

function callGemini(apiKey: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    const parsedUrl = new URL(url);

    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 60000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
              reject(new Error(`Invalid response from Gemini: ${body}`));
              return;
            }
            resolve(text);
          } catch (e: unknown) {
            const err = e as Error;
            reject(new Error(`Failed to parse Gemini response: ${err.message}`));
          }
        });
      },
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini API request timed out'));
    });
    req.end(payload);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function inferFileNameFromOrder(order: string, userSpecifiedName?: string): string {
  if (userSpecifiedName && userSpecifiedName.includes('.')) return userSpecifiedName;

  const lower = order.toLowerCase();
  const fileMention = order.match(/\b([a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,5})\b/);
  if (fileMention && !fileMention[1].endsWith('.com') && !fileMention[1].endsWith('.org')) {
    return fileMention[1];
  }

  if (/\b(arduino|nano|uno|esp32|pid|motor|led|blink|servo|sensor|embedded|firmware)\b/i.test(lower)) {
    if (lower.includes('pid') || lower.includes('motor')) return 'arduino_nano_pid.ino';
    if (lower.includes('blink') || lower.includes('led')) return 'arduino_nano_blink.ino';
    return 'arduino_sketch.ino';
  }
  if (/\b(python|django|flask|fastapi|pandas|numpy|script)\b/i.test(lower)) {
    return 'script.py';
  }
  if (/\b(html|webpage|site|page|landing)\b/i.test(lower)) {
    return 'index.html';
  }
  if (/\b(css|styling|style|styles)\b/i.test(lower)) {
    return 'styles.css';
  }
  if (/\b(express|node|backend|router|api|server|javascript)\b/i.test(lower)) {
    return 'server.js';
  }
  if (/\b(typescript|ts)\b/i.test(lower)) {
    return 'app.ts';
  }
  if (/\b(c\+\+|cpp)\b/i.test(lower)) {
    return 'main.cpp';
  }
  if (/\b(rust)\b/i.test(lower)) {
    return 'main.rs';
  }
  if (/\b(json)\b/i.test(lower)) {
    return 'data.json';
  }

  return 'solution.txt';
}

function inferCommandFromOrder(order: string, workerDir?: string): { isRun: boolean; command: string } {
  const lower = order.toLowerCase().trim();

  // 1. Explicit mention of antigravity cli or agy
  if (/\b(antigravity|agy)\b/i.test(lower)) {
    if (/\b(help|-h)\b/i.test(lower)) return { isRun: true, command: 'agy --help' };
    if (/\b(status)\b/i.test(lower)) return { isRun: true, command: 'agy status' };
    if (/\b(goal)\b/i.test(lower)) return { isRun: true, command: 'agy --goal' };
    return { isRun: true, command: 'agy --version' };
  }

  // 2. Direct command syntax: e.g. "run: dir" or "cmd: whoami"
  const colonMatch = order.match(/^(?:run|execute|exec|cmd):\s*(.+)$/i);
  if (colonMatch) {
    return { isRun: true, command: colonMatch[1].trim() };
  }

  // 3. Asking to run a python script / test
  if (/\b(run|execute|test)\b.*\b(python|script\.py|\.py)\b/i.test(lower) || /\b(python)\b.*\b(run|execute|test)\b/i.test(lower)) {
    let pyFile = 'script.py';
    if (workerDir && fs.existsSync(workerDir)) {
      try {
        const files = fs.readdirSync(workerDir).filter((f) => f.endsWith('.py'));
        if (files.length > 0) pyFile = files[0];
      } catch { /* ignore */ }
    }
    return { isRun: true, command: `python ${pyFile}` };
  }

  // 4. Asking to "run the file" or "run the script" or "execute the file"
  if (/\b(run|execute)\b.*\b(file|script|code|program|test)\b/i.test(lower)) {
    if (workerDir && fs.existsSync(workerDir)) {
      try {
        const files = fs.readdirSync(workerDir);
        const py = files.find((f) => f.endsWith('.py'));
        if (py) return { isRun: true, command: `python ${py}` };
        const js = files.find((f) => f.endsWith('.js'));
        if (js) return { isRun: true, command: `node ${js}` };
      } catch { /* ignore */ }
    }
    return { isRun: true, command: 'python script.py' };
  }

  // 5. Asking to run a command on PowerShell / CMD / terminal
  if (/\b(powershell|powersheel|terminal|cmd|shell|cli)\b/i.test(lower) && /\b(run|running|execute|exec|test|command)\b/i.test(lower)) {
    const quoteMatch = order.match(/["'`]([^"'`]+)["'`]/);
    if (quoteMatch) {
      return { isRun: true, command: quoteMatch[1].trim() };
    }
    if (/\b(dir|ls)\b/i.test(lower)) return { isRun: true, command: 'Get-ChildItem' };
    if (/\b(ipconfig|ifconfig)\b/i.test(lower)) return { isRun: true, command: 'ipconfig' };
    if (/\b(whoami)\b/i.test(lower)) return { isRun: true, command: 'whoami' };
    if (/\b(git status)\b/i.test(lower)) return { isRun: true, command: 'git status' };
    return { isRun: true, command: 'Get-ChildItem' };
  }

  // 6. Direct command patterns like "run npm install", "run node app.js"
  const directMatch = order.match(/\b(?:run|execute)\s+(npm\s+\w+|node\s+\S+|python\s+\S+|pip\s+\S+|git\s+\S+|dir|ls|echo\s+.+)/i);
  if (directMatch) {
    return { isRun: true, command: directMatch[1].trim() };
  }

  return { isRun: false, command: '' };
}

function generateFallbackCode(worker: TeamMemberInfo, fileName: string, taskAction: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.py') {
    return (
      `#!/usr/bin/env python3\n` +
      `"""\n` +
      `Module implemented by ${worker.name} (${worker.role})\n` +
      `Task: ${taskAction}\n` +
      `"""\n\n` +
      `import sys\nimport os\n\n` +
      `def main():\n` +
      `    print(f"[{worker.name}] Executing task: ${taskAction}")\n` +
      `    print("Workstation initialized successfully. Ready for operations.")\n\n` +
      `if __name__ == '__main__':\n` +
      `    main()\n`
    );
  }
  if (ext === '.ino') {
    return (
      `// Arduino Sketch by ${worker.name} (${worker.role})\n` +
      `// Task: ${taskAction}\n\n` +
      `const int LED_PIN = 13;\n\n` +
      `void setup() {\n` +
      `  Serial.begin(115200);\n` +
      `  pinMode(LED_PIN, OUTPUT);\n` +
      `  Serial.println("System initialized: ${taskAction}");\n` +
      `}\n\n` +
      `void loop() {\n` +
      `  digitalWrite(LED_PIN, HIGH);\n` +
      `  delay(500);\n` +
      `  digitalWrite(LED_PIN, LOW);\n` +
      `  delay(500);\n` +
      `}\n`
    );
  }
  if (ext === '.html') {
    return (
      `<!DOCTYPE html>\n` +
      `<html lang="en">\n` +
      `<head>\n` +
      `  <meta charset="UTF-8">\n` +
      `  <title>${taskAction}</title>\n` +
      `  <style>\n` +
      `    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; }\n` +
      `    .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; border: 1px solid #334155; }\n` +
      `  </style>\n` +
      `</head>\n` +
      `<body>\n` +
      `  <div class="card">\n` +
      `    <h1>${taskAction}</h1>\n` +
      `    <p>Implemented by ${worker.name} (${worker.role})</p>\n` +
      `  </div>\n` +
      `</body>\n` +
      `</html>\n`
    );
  }
  return `// Implementation by ${worker.name} (${worker.role})\n// Directive: ${taskAction}\n// Timestamp: ${new Date().toISOString()}\n`;
}

export interface PastDeed {
  id: string;
  timestamp: number;
  task: string;
  order: string;
  fileName: string;
  fullPath: string;
  fileSize: number;
  summary: string;
}

export interface EmployeeWorkspaceData {
  assignedFolder: string;
  pastDeeds: PastDeed[];
}

export interface EmployeeWorkspaceInfo {
  employeeName: string;
  role: string;
  assignedFolder: string;
  fullPath: string;
  exists: boolean;
  files: Array<{
    name: string;
    isDir: boolean;
    size: number;
    ext: string;
    updatedAt: number;
  }>;
  pastDeeds: PastDeed[];
}

export interface WorkspaceTreeResult {
  currentPath: string;
  parentPath: string | null;
  folders: string[];
  files: Array<{ name: string; size: number; ext: string; updatedAt: number }>;
}

const workspacesFilePath = path.join(process.cwd(), 'employee-workspaces.json');
let employeeWorkspaceMap = new Map<string, EmployeeWorkspaceData>();

function loadWorkspacesMap(): void {
  try {
    if (fs.existsSync(workspacesFilePath)) {
      const content = fs.readFileSync(workspacesFilePath, 'utf-8');
      const data = JSON.parse(content);
      employeeWorkspaceMap = new Map(Object.entries(data));
    }
  } catch {
    /* ignore */
  }
}

function saveWorkspacesMap(): void {
  try {
    const obj = Object.fromEntries(employeeWorkspaceMap.entries());
    fs.writeFileSync(workspacesFilePath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}

loadWorkspacesMap();

export function getEmployeeWorkspace(employeeName: string): EmployeeWorkspaceData {
  const norm = employeeName.trim();
  const existing = employeeWorkspaceMap.get(norm) || employeeWorkspaceMap.get(norm.toLowerCase());
  if (existing) return existing;

  // Default to folder named after the employee
  const defaultData: EmployeeWorkspaceData = {
    assignedFolder: norm,
    pastDeeds: [],
  };
  employeeWorkspaceMap.set(norm, defaultData);
  saveWorkspacesMap();
  return defaultData;
}

export function setEmployeeWorkspaceFolder(employeeName: string, folderRelPath: string): EmployeeWorkspaceData {
  const norm = employeeName.trim();
  const current = getEmployeeWorkspace(norm);
  const cleanPath = folderRelPath.trim().replace(/^[\\/]+|[\\/]+$/g, '') || '.';
  current.assignedFolder = cleanPath;
  employeeWorkspaceMap.set(norm, current);
  saveWorkspacesMap();
  return current;
}

export function recordEmployeeDeed(employeeName: string, deed: Omit<PastDeed, 'id' | 'timestamp'>): PastDeed {
  const norm = employeeName.trim();
  const current = getEmployeeWorkspace(norm);
  const fullDeed: PastDeed = {
    id: `deed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...deed,
  };
  current.pastDeeds.unshift(fullDeed);
  if (current.pastDeeds.length > 50) {
    current.pastDeeds = current.pastDeeds.slice(0, 50);
  }
  employeeWorkspaceMap.set(norm, current);
  saveWorkspacesMap();
  return fullDeed;
}

export function getWorkspaceTree(subpath = ''): WorkspaceTreeResult {
  const rootDir = process.cwd();
  const cleanSub = (subpath || '').trim().replace(/^[\\/]+|[\\/]+$/g, '');
  const targetDir = cleanSub && cleanSub !== '.' ? path.resolve(rootDir, cleanSub) : rootDir;

  // Security check: cannot escape root
  const rel = path.relative(rootDir, targetDir);
  if (rel.startsWith('..')) {
    return {
      currentPath: '',
      parentPath: null,
      folders: [],
      files: [],
    };
  }

  const currentPath = cleanSub === '.' ? '' : cleanSub.replace(/\\/g, '/');
  let parentPath: string | null = null;
  if (currentPath) {
    const parent = path.dirname(currentPath);
    parentPath = parent === '.' || parent === '/' ? '' : parent.replace(/\\/g, '/');
  }

  const folders: string[] = [];
  const files: Array<{ name: string; size: number; ext: string; updatedAt: number }> = [];

  if (fs.existsSync(targetDir)) {
    try {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const entryPath = path.join(targetDir, entry.name);
        try {
          const stats = fs.statSync(entryPath);
          if (entry.isDirectory()) {
            folders.push(entry.name);
          } else {
            files.push({
              name: entry.name,
              size: stats.size,
              ext: path.extname(entry.name).toLowerCase(),
              updatedAt: stats.mtimeMs,
            });
          }
        } catch {
          /* ignore unreadable entry */
        }
      }
    } catch {
      /* ignore read errors */
    }
  }

  folders.sort((a, b) => a.localeCompare(b));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return {
    currentPath,
    parentPath,
    folders,
    files,
  };
}

export function getAllEmployeeWorkspaces(teamRoster: TeamMemberInfo[] = []): EmployeeWorkspaceInfo[] {
  const rootDir = process.cwd();
  const results: EmployeeWorkspaceInfo[] = [];

  // Names from team roster or from known folders with actual deeds/folders
  const names = new Set<string>();
  for (const m of teamRoster) names.add(m.name);
  for (const [k, v] of employeeWorkspaceMap.entries()) {
    if (/^agent-\d+$/i.test(k) && (!v.pastDeeds || v.pastDeeds.length === 0)) continue;
    if (v.pastDeeds && v.pastDeeds.length > 0) names.add(k);
    else if (fs.existsSync(path.join(rootDir, v.assignedFolder || k))) names.add(k);
  }

  // Defaults if empty
  if (names.size === 0) {
    ['Boss-1', 'JACK', 'ROY', 'Rickey'].forEach((n) => names.add(n));
  }

  for (const name of names) {
    const matchedRoster = teamRoster.find((m) => m.name.toLowerCase() === name.toLowerCase());
    const role = matchedRoster?.role || getSavedRole(name) || (/boss/i.test(name) ? 'Executive Director / Boss' : 'Software Engineer');
    const ws = getEmployeeWorkspace(name);
    const assigned = ws.assignedFolder || name;
    const fullPath = path.resolve(rootDir, assigned);
    const exists = fs.existsSync(fullPath);

    const files: Array<{ name: string; isDir: boolean; size: number; ext: string; updatedAt: number }> = [];
    if (exists) {
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === '.git' || entry.name === 'node_modules') continue;
          try {
            const st = fs.statSync(path.join(fullPath, entry.name));
            files.push({
              name: entry.name,
              isDir: entry.isDirectory(),
              size: st.size,
              ext: path.extname(entry.name).toLowerCase(),
              updatedAt: st.mtimeMs,
            });
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }

    results.push({
      employeeName: name,
      role,
      assignedFolder: assigned.replace(/\\/g, '/'),
      fullPath,
      exists,
      files,
      pastDeeds: ws.pastDeeds || [],
    });
  }

  return results;
}

async function generateWorkerFileContent(
  apiKey: string,
  worker: TeamMemberInfo,
  taskAction: string,
  overallOrder: string,
  destPath: string,
  context?: {
    assignedFolder?: string;
    existingFiles?: string[];
    pastDeeds?: PastDeed[];
  },
): Promise<string> {
  const activeKey = apiKey || getGeminiApiKey();
  if (!activeKey) {
    return `// Implemented by ${worker.name} (${worker.role}) for: ${overallOrder}\n`;
  }
  const fileName = path.basename(destPath);
  const filesList = context?.existingFiles && context.existingFiles.length > 0
    ? `Existing files in your directory:\n${context.existingFiles.map((f) => `- ${f}`).join('\n')}`
    : 'Folder is currently clean / empty.';

  const deedsList = context?.pastDeeds && context.pastDeeds.length > 0
    ? `Your past deeds/context in this workspace:\n${context.pastDeeds.slice(0, 4).map((d) => `- Task: "${d.task}" -> created ${d.fileName} (${d.summary})`).join('\n')}`
    : 'No previous recorded deeds in this workspace.';

  const prompt =
    `You are ${worker.name}, a senior ${worker.role} at OxiTech.\n` +
    `Assigned workspace directory: "${context?.assignedFolder || worker.name}"\n` +
    `${filesList}\n\n` +
    `${deedsList}\n\n` +
    `Task assigned to you: "${taskAction}"\n` +
    `Director's overall goal: "${overallOrder}"\n` +
    `File to produce: "${fileName}"\n\n` +
    `Write the COMPLETE, fully functional, production-ready source code or document for this file.\n` +
    `REQUIREMENTS:\n` +
    `1. Maintain context and continuity with your existing files and past deeds in this directory.\n` +
    `2. Provide the actual, working code that accomplishes the task completely (e.g. if Arduino, write full setup(), loop(), pin assignments, control math/logic; if Python, write complete working script; if HTML/CSS/JS, write complete interactive code).\n` +
    `3. Do NOT use placeholders, "TODO", or stub comments. Implement all logic thoroughly.\n` +
    `4. Output ONLY the raw source code / content with helpful inline comments. Do NOT wrap in markdown \`\`\` code fences or add conversational text.\n`;

  try {
    const raw = await callGemini(activeKey, prompt);
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      const firstNewline = clean.indexOf('\n');
      const lastFence = clean.lastIndexOf('```');
      if (firstNewline !== -1 && lastFence > firstNewline) {
        clean = clean.slice(firstNewline + 1, lastFence).trim();
      }
    }
    return clean;
  } catch (err) {
    console.warn(`[BossService] Worker ${worker.name} code generation error:`, err);
    return generateFallbackCode(worker, fileName, taskAction);
  }
}

const rolesFilePath = path.join(process.cwd(), 'agent-roles.json');
let agentRoleMap = new Map<string, string>();

function loadRoleMap(): void {
  try {
    if (fs.existsSync(rolesFilePath)) {
      const content = fs.readFileSync(rolesFilePath, 'utf-8');
      const data = JSON.parse(content);
      agentRoleMap = new Map(Object.entries(data));
    }
  } catch {
    /* ignore */
  }
}

function saveRoleMap(): void {
  try {
    const obj = Object.fromEntries(agentRoleMap.entries());
    fs.writeFileSync(rolesFilePath, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    /* ignore */
  }
}

loadRoleMap();

export function getSavedRole(folderName: string, sessionId?: string): string | undefined {
  if (sessionId && agentRoleMap.has(sessionId)) return agentRoleMap.get(sessionId);
  if (agentRoleMap.has(folderName)) return agentRoleMap.get(folderName);
  if (agentRoleMap.has(folderName.toLowerCase())) return agentRoleMap.get(folderName.toLowerCase());

  // Try reading role from workspace README.md
  try {
    const readmePath = path.join(process.cwd(), folderName, 'README.md');
    if (fs.existsSync(readmePath)) {
      const firstLine = fs.readFileSync(readmePath, 'utf-8').split('\n')[0] || '';
      const match = firstLine.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        const found = match[1].trim();
        agentRoleMap.set(folderName, found);
        agentRoleMap.set(folderName.toLowerCase(), found);
        saveRoleMap();
        return found;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function getTeamMembers(store: AgentStateStore): TeamMemberInfo[] {
  const members: TeamMemberInfo[] = [];
  for (const [id, a] of store) {
    let folder = a.folderName || (a.projectDir ? path.basename(a.projectDir) : '');
    if (!folder && a.agentName) folder = a.agentName;
    if (!folder && a.sessionId) {
      if (/boss/i.test(a.sessionId)) folder = 'Boss-1';
      else if (/roy/i.test(a.sessionId)) folder = 'ROY';
      else if (/jack/i.test(a.sessionId)) folder = 'JACK';
      else if (/rickey/i.test(a.sessionId)) folder = 'Rickey';
      else if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(a.sessionId)) folder = `Antigravity-${id}`;
      else folder = a.sessionId.replace(/^kibee-(emp-|boss-)?/i, '');
    }
    if (!folder || folder.startsWith('Agent ')) {
      if (folder && /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(folder)) {
        folder = `Antigravity-${id}`;
      } else {
        folder = folder || `Agent-${id}`;
      }
    }
    const isBoss = folder.toLowerCase().includes('boss') || a.sessionId.toLowerCase().includes('boss');
    let currentStatus = a.isWaiting ? 'Waiting for orders' : 'Active';
    if (a.activeToolStatuses && a.activeToolStatuses.size > 0) {
      currentStatus = Array.from(a.activeToolStatuses.values())[0];
    }
    const savedRole = getSavedRole(folder, a.sessionId);
    const role = isBoss
      ? (savedRole || 'Executive Boss / Director')
      : (savedRole || (a.isExternal ? 'AI Systems Specialist' : 'Fullstack Engineer'));

    members.push({
      id,
      sessionId: a.sessionId,
      name: folder,
      role,
      isBoss,
      isWaiting: a.isWaiting ?? true,
      status: currentStatus,
    });
  }
  return members;
}

export async function addAgentToOffice(
  options: HttpServerOptions,
  name: string,
  role: string,
  isBoss = false,
): Promise<{ ok: boolean; sessionId: string; folder: string }> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').trim() || (isBoss ? 'Boss' : 'Employee');
  const rootDir = process.cwd();
  const agentDir = path.join(rootDir, safeName);

  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'README.md'),
      `# ${safeName} (${role})\nWorkspace for ${isBoss ? 'Boss' : 'Employee'}: ${role}\n`,
    );
  }

  const sessionId = isBoss
    ? `kibee-boss-${Date.now()}`
    : `kibee-emp-${safeName.toLowerCase()}-${Date.now()}`;

  // Save role to registry
  agentRoleMap.set(sessionId, role);
  agentRoleMap.set(safeName, role);
  agentRoleMap.set(safeName.toLowerCase(), role);
  saveRoleMap();

  // 1. Send PreToolUse to adopt agent in office
  options.onHookEvent?.('antigravity', {
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: isBoss ? 'order_workers' : 'ask_question',
    tool_input: {
      question: `${role} standing by for commands`,
      order: `${safeName} ready to direct team`,
    },
    cwd: agentDir,
  });

  await sleep(150);

  // 2. Put in waiting state
  options.onHookEvent?.('antigravity', {
    session_id: sessionId,
    hook_event_name: 'Stop',
    awaiting_input: true,
    cwd: agentDir,
  });

  return { ok: true, sessionId, folder: safeName };
}

export function removeAgentFromOffice(options: HttpServerOptions, id: number): boolean {
  if (options.runtime) {
    options.runtime.removeAgent(id);
    return true;
  }
  options.store.delete(id);
  options.store.broadcast({ type: 'agentClosed', id });
  return true;
}

export async function commandAgentDirectly(
  options: HttpServerOptions,
  id: number,
  task: string,
): Promise<boolean> {
  const agent = options.store.get(id);
  if (!agent) return false;

  const cwd = agent.projectDir || process.cwd();

  // 1. PreToolUse
  options.onHookEvent?.('antigravity', {
    session_id: agent.sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: 'run_command',
    tool_input: { CommandLine: task },
    cwd,
  });

  // 2. Wait
  await sleep(2500);

  // 3. Complete
  options.onHookEvent?.('antigravity', {
    session_id: agent.sessionId,
    hook_event_name: 'Stop',
    awaiting_input: true,
    cwd,
  });

  return true;
}

export interface BossOrderResult {
  isDirective: boolean;
  reply: string;
  tasks: DecomposedTask[];
}

export async function ensureDefaultOfficeTeam(options: HttpServerOptions): Promise<TeamMemberInfo[]> {
  let team = getTeamMembers(options.store);
  if (team.length > 0) return team;

  console.log('[BossService] Seating office team members into workstations...');
  const rootDir = process.cwd();
  const knownDirs = ['Boss-1', 'ROY', 'JACK', 'Rickey'];
  const existingDirs = knownDirs.filter((d) => fs.existsSync(path.join(rootDir, d, 'README.md')));

  if (existingDirs.length > 0) {
    for (const dir of existingDirs) {
      const isBoss = dir.toLowerCase().includes('boss');
      const role = getSavedRole(dir) || (isBoss ? 'Executive Boss / Director' : 'Fullstack Engineer');
      await addAgentToOffice(options, dir, role, isBoss);
    }
  } else {
    await addAgentToOffice(options, 'Boss-1', 'Executive Boss / Director', true);
    await addAgentToOffice(options, 'ROY', 'Frontend Developer', false);
    await addAgentToOffice(options, 'JACK', 'Backend Developer', false);
    await addAgentToOffice(options, 'Rickey', 'Fullstack Engineer', false);
  }

  await sleep(250);
  team = getTeamMembers(options.store);
  return team;
}

export async function executeBossOrder(
  options: HttpServerOptions,
  order: string,
): Promise<BossOrderResult> {
  const team = await ensureDefaultOfficeTeam(options);
  const boss = team.find((m) => m.isBoss) || team[0];
  const workers = team.filter((m) => !m.isBoss);

  const rootDir = process.cwd();
  const bossDir = boss ? path.join(rootDir, boss.name) : rootDir;

  const apiKey = getGeminiApiKey();

  const isLayoutFixOrder = /\b(reset|fix|bring back|restore|clean|revert)\b.*\b(office|layout|design|room|walls|furniture)\b/i.test(order);
  if (isLayoutFixOrder) {
    let defaultLayout = options.assetCache?.defaultLayout as Record<string, unknown> | undefined;
    if (!defaultLayout) {
      const searchPaths = [
        path.join(process.cwd(), 'dist', 'assets', 'default-layout-1.json'),
        path.join(process.cwd(), 'webview-ui', 'public', 'assets', 'default-layout-1.json'),
      ];
      for (const sp of searchPaths) {
        if (fs.existsSync(sp)) {
          try {
            defaultLayout = JSON.parse(fs.readFileSync(sp, 'utf-8')) as Record<string, unknown>;
            break;
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (defaultLayout) {
      writeLayoutToFile(defaultLayout);
      options.store.broadcast({ type: 'layoutLoaded', layout: defaultLayout });
    }
    const layoutReply = "Right away, Director! I've restored the pristine OxiTech headquarters office layout. All walls, floors, and workstations are back in order.";

    if (boss) {
      options.store.broadcast({
        type: 'agentSpeech',
        id: boss.id,
        text: layoutReply,
        sender: boss.name,
        role: 'boss',
        timestamp: Date.now(),
      });
      options.store.broadcast({
        type: 'intercomMessage',
        message: {
          id: `msg-${Date.now()}-boss`,
          sender: boss.name,
          role: 'boss',
          text: layoutReply,
          timestamp: Date.now(),
        },
      });
      options.onHookEvent?.('antigravity', {
        session_id: boss.sessionId,
        hook_event_name: 'Stop',
        cwd: bossDir,
      });
    }

    return {
      reply: layoutReply,
      isDirective: false,
      tasks: [],
    };
  }

  // 1. Boss starts strategizing with Gemini
  if (boss) {
    options.onHookEvent?.('antigravity', {
      session_id: boss.sessionId,
      hook_event_name: 'PreToolUse',
      tool_name: 'think',
      tool_input: { thought: `Thinking: ${order}` },
      cwd: bossDir,
    });
  }

  let isDirective = false;
  let reply = '';
  let subtasks: DecomposedTask[] = [];

  if (apiKey) {
    try {
      // Build rich roster with each worker's assigned folder + recent deeds
      const rosterLines = workers.map((w, idx) => {
        const ws = getEmployeeWorkspace(w.name);
        const folder = ws.assignedFolder || w.name;
        let existingFiles: string[] = [];
        try {
          const fp = path.join(rootDir, folder);
          if (fs.existsSync(fp)) existingFiles = fs.readdirSync(fp).filter(f => !f.startsWith('.') && f !== 'node_modules').slice(0, 8);
        } catch { /* ignore */ }
        const deedSummary = ws.pastDeeds.slice(0, 3).map(d => `"${d.task}" → ${d.fileName}`).join('; ') || 'none yet';
        return (
          `${idx + 1}. Name: "${w.name}" | Role: "${w.role}" | Availability: ${w.isWaiting ? 'FREE' : 'BUSY'} | ` +
          `Workspace: "${folder}" | Files: [${existingFiles.join(', ') || 'empty'}] | Recent work: ${deedSummary}`
        );
      });
      const rosterPrompt = rosterLines.length > 0 ? rosterLines.join('\n') : 'No workers currently registered.';

      const prompt =
        `You are the Executive Boss AI at OxiTech, directing an engineering team inside the Pixel Agents Office.\n` +
        `Active team roster (with their dedicated workspaces and history):\n${rosterPrompt}\n\n` +
        `The Director (User) said: "${order}"\n\n` +
        `UNDERSTANDING TASKS:\n` +
        `- Read the Director's request carefully. Parse the EXACT intent: what should be created/run/fixed/installed, for whom, and where.\n` +
        `- If a filename or folder is mentioned, use it exactly.\n` +
        `- If the order involves RUNNING, EXECUTING, TESTING, INSTALLING something — use tool="run_command" and fill "command" with the exact shell command to run.\n\n` +
        `DELEGATION RULES:\n` +
        `1. Greetings / queries ("Hello", "What can you do?", "Ideas?"): isDirective=false, tasks=[]. Reply with 3-4 creative project ideas.\n` +
        `2. Real directives: isDirective=true.\n` +
        `   - SELECTIVITY: Assign ONLY the employee(s) actually needed. Leave others idle.\n` +
        `   - Role matching:\n` +
        `     * Name mentioned explicitly → assign only that person.\n` +
        `     * Frontend/UI/CSS/HTML/React → Frontend Developer.\n` +
        `     * Backend/API/Server/Database/Python/Node/Script → Backend Developer.\n` +
        `     * Fullstack multi-tier → assign both with distinct responsibilities.\n` +
        `     * Single-file tasks → ONE employee only.\n` +
        `   - NEVER give duplicate/identical work to multiple employees.\n` +
        `   - Each task MUST have a unique, role-appropriate responsibility.\n` +
        `   - Files are ALWAYS saved to the employee's own dedicated workspace folder (do NOT use Desktop or absolute paths unless explicitly requested).\n` +
        `   - "fileName": exact filename with extension (e.g. "auth_api.py", "dashboard.html").\n` +
        `   - "code": complete, production-ready content — NO placeholders, NO TODOs.\n` +
        `   - "tool": "write_to_file" for creating files, "run_command" for executing shell commands.\n` +
        `   - "command": (required when tool=run_command) the exact shell command to run in the employee's folder.\n\n` +
        `Respond ONLY with valid JSON:\n` +
        `{\n` +
        `  "isDirective": true,\n` +
        `  "reply": "Executive summary of your assignment decisions",\n` +
        `  "tasks": [\n` +
        `    {\n` +
        `      "employee": "Exact Name from roster",\n` +
        `      "action": "Precise task description",\n` +
        `      "fileName": "output.py",\n` +
        `      "code": "Complete file content here",\n` +
        `      "tool": "write_to_file",\n` +
        `      "command": "",\n` +
        `      "detail": "Why this employee and what they will produce"\n` +
        `    }\n` +
        `  ]\n` +
        `}`;

      const rawText = await callGemini(apiKey, prompt);
      let cleanJson = rawText.trim();
      const firstBrace = cleanJson.indexOf('{');
      const lastBrace = cleanJson.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
      }
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(cleanJson) as Record<string, unknown>;
      } catch {
        try {
          const sanitized = cleanJson.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
            if (c === '\n') return '\\n';
            if (c === '\r') return '\\r';
            if (c === '\t') return '\\t';
            return '';
          });
          parsed = JSON.parse(sanitized) as Record<string, unknown>;
        } catch {
          const replyMatch = cleanJson.match(/"reply"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
          parsed = {
            isDirective: true,
            reply: replyMatch ? replyMatch[1].replace(/\\n/g, '\n') : '',
            tasks: [],
          };
        }
      }
      isDirective = Boolean(parsed.isDirective);
      reply = (parsed.reply as string) || '';

      const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      const nameMatch = order.match(/(?:called|named|file|create)\s+([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)/i);
      const userSpecifiedName = nameMatch ? nameMatch[1] : '';

      const validTasks: DecomposedTask[] = [];
      for (const t of rawTasks) {
        const targetName = (t.employee || t.assignee || t.worker || '').trim().toLowerCase();
        const matchedWorker = workers.find(
          (w) =>
            w.name.toLowerCase() === targetName ||
            (targetName === 'joy' && w.name.toLowerCase() === 'roy') ||
            w.name.toLowerCase().includes(targetName) ||
            targetName.includes(w.name.toLowerCase()),
        );
        if (matchedWorker) {
          const action = t.action || t.task || t.title || t.description || order;
          let fileName = t.fileName || t.filePath || t.path || userSpecifiedName || '';
          let targetPath = t.targetPath || t.filePath || t.path || '';

          if (order.toLowerCase().includes('desktop')) {
            if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
              fileName = path.basename(fileName) || userSpecifiedName || 'desktop_file.txt';
            }
            targetPath = `Desktop/${fileName}`;
          }

          if (!fileName) {
            fileName = order.toLowerCase().includes('python')
              ? 'script.py'
              : order.toLowerCase().includes('html')
                ? 'index.html'
                : 'task_output.txt';
          }

          const cmdCheck = inferCommandFromOrder(order, path.join(rootDir, matchedWorker.name));
          const isRun = t.tool === 'run_command' || Boolean(t.command) || cmdCheck.isRun;
          validTasks.push({
            employee: matchedWorker.name,
            action: isRun ? `Run: ${t.command || cmdCheck.command || action}` : action,
            fileName: isRun ? '' : fileName,
            targetPath: targetPath || fileName,
            code: t.code || t.content || t.script || '',
            tool: isRun ? 'run_command' : (t.tool || 'write_to_file'),
            detail: t.detail || action,
            command: t.command || (isRun ? cmdCheck.command : ''),
          });
        }
      }
      subtasks = validTasks;

      if (isDirective && subtasks.length === 0 && workers.length > 0) {
        const isDesktop = order.toLowerCase().includes('desktop');
        const exactName = inferFileNameFromOrder(order, userSpecifiedName);
        const lowerOrder = order.toLowerCase();

        const namedWorker = workers.find((w) => {
          const n = w.name.toLowerCase();
          const regex = n === 'roy' ? /\b(roy|joy)\b/i : new RegExp(`\\b${n}\\b`, 'i');
          return regex.test(lowerOrder);
        });

        let chosenWorker: TeamMemberInfo | undefined = namedWorker;
        if (!chosenWorker) {
          const isHardware = /\b(arduino|nano|uno|esp32|pid|motor|embedded|firmware|hardware|robotics|sensors?|microcontroller)\b/i.test(lowerOrder);
          const isBackend = /\b(backend|api|server|database|sql|endpoint|node|express|python|rust|c\+\+|cpp|c)\b/i.test(lowerOrder) || isHardware;
          const isFrontend = /\b(frontend|ui|css|html|react|design|button|page|view|navbar|tailwind)\b/i.test(lowerOrder);

          if (isHardware) {
            chosenWorker = workers.find((w) => /backend/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /backend/i.test(w.role)) ||
              workers.find((w) => /fullstack/i.test(w.role));
          } else if (isBackend) {
            chosenWorker = workers.find((w) => /backend/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /backend/i.test(w.role));
          } else if (isFrontend) {
            chosenWorker = workers.find((w) => /frontend/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
              workers.find((w) => /frontend/i.test(w.role));
          }

          if (!chosenWorker) {
            chosenWorker = workers.find((w) => w.isWaiting) || workers[0];
          }
        }

        if (chosenWorker) {
          const workerDir = path.join(rootDir, chosenWorker.name);
          const cmdCheck = inferCommandFromOrder(order, workerDir);
          subtasks = [
            {
              employee: chosenWorker.name,
              action: cmdCheck.isRun ? `Run: ${cmdCheck.command}` : `Execute: ${order}`,
              fileName: cmdCheck.isRun ? '' : exactName,
              targetPath: isDesktop ? `Desktop/${exactName}` : exactName,
              code: '',
              tool: cmdCheck.isRun ? 'run_command' : 'write_to_file',
              command: cmdCheck.isRun ? cmdCheck.command : '',
              detail: cmdCheck.isRun ? `Ran command: ${cmdCheck.command}` : `Implementation of ${order}`,
            },
          ];
        }
      }
    } catch (err) {
      console.warn('[Boss] Gemini prompt error:', err);
    }
  }

  // Fallbacks if Gemini unavailable or failed
  if (!reply) {
    const isGreeting = /^(hello|hi|hey|good morning|sup|howdy)/i.test(order.trim());
    const isQuestion = /\?|what can|who are|how do|ideas/i.test(order.trim());
    if (isGreeting || isQuestion) {
      isDirective = false;
      reply = `Hello Director! I am your Executive Boss. The engineering team (${workers.map((w) => `${w.name} [${w.role}]`).join(', ') || 'team'}) is seated and standing by for your directives!`;
    } else {
      isDirective = true;
      const isDesktop = order.toLowerCase().includes('desktop');
      const nameMatch = order.match(/(?:called|named|file|create)\s+([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)/i);
      const userSpecifiedName = nameMatch ? nameMatch[1] : undefined;
      const fallbackFile = inferFileNameFromOrder(order, userSpecifiedName);

      const lowerOrder = order.toLowerCase();
      const namedWorker = workers.find((w) => {
        const n = w.name.toLowerCase();
        const regex = n === 'roy' ? /\b(roy|joy)\b/i : new RegExp(`\\b${n}\\b`, 'i');
        return regex.test(lowerOrder);
      });

      let chosenWorker = namedWorker;
      if (!chosenWorker) {
        const isHardware = /\b(arduino|nano|uno|esp32|pid|motor|embedded|firmware|hardware|robotics|sensors?|microcontroller)\b/i.test(lowerOrder);
        const isBackend = /\b(backend|api|server|database|sql|endpoint|node|express|python|rust|c\+\+|cpp|c)\b/i.test(lowerOrder) || isHardware;
        const isFrontend = /\b(frontend|ui|css|html|react|design|button|page|view|navbar|tailwind)\b/i.test(lowerOrder);

        if (isHardware) {
          chosenWorker = workers.find((w) => /backend/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /backend/i.test(w.role)) ||
            workers.find((w) => /fullstack/i.test(w.role));
        } else if (isBackend) {
          chosenWorker = workers.find((w) => /backend/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /backend/i.test(w.role));
        } else if (isFrontend) {
          chosenWorker = workers.find((w) => /frontend/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /fullstack/i.test(w.role) && w.isWaiting) ||
            workers.find((w) => /frontend/i.test(w.role));
        }

        if (!chosenWorker) {
          chosenWorker = workers.find((w) => w.isWaiting) || workers[0];
        }
      }

      if (chosenWorker) {
        const workerDir = path.join(rootDir, chosenWorker.name);
        const cmdCheck = inferCommandFromOrder(order, workerDir);
        reply = cmdCheck.isRun
          ? `Right away, Director! Having ${chosenWorker.name} (${chosenWorker.role}) execute \`${cmdCheck.command}\` in their workspace.`
          : `Understood, Director! Assigning ${chosenWorker.name} (${chosenWorker.role}) to handle "${order}".`;
        subtasks = [
          {
            employee: chosenWorker.name,
            action: cmdCheck.isRun ? `Run: ${cmdCheck.command}` : `Execute: ${order}`,
            fileName: cmdCheck.isRun ? '' : fallbackFile,
            targetPath: isDesktop ? `Desktop/${fallbackFile}` : fallbackFile,
            code: '',
            tool: cmdCheck.isRun ? 'run_command' : 'write_to_file',
            command: cmdCheck.isRun ? cmdCheck.command : '',
            detail: cmdCheck.isRun ? `Executed: ${cmdCheck.command}` : `Execution of ${order}`,
          },
        ];
      } else {
        reply = `Understood, Director! Processing "${order}".`;
        subtasks = [];
      }
    }
  }

  // Log user message to intercom
  options.store.broadcast({
    type: 'intercomMessage',
    message: {
      id: `msg-${Date.now()}-dir`,
      sender: 'Director (You)',
      role: 'director',
      text: order,
      timestamp: Date.now(),
    },
  });

  // 2. Boss speaks the reply in speech bubble & broadcasts speech event!
  if (boss) {
    options.store.broadcast({
      type: 'agentSpeech',
      id: boss.id,
      text: reply,
      sender: boss.name,
      role: 'boss',
      timestamp: Date.now(),
    });

    options.store.broadcast({
      type: 'intercomMessage',
      message: {
        id: `msg-${Date.now()}-boss`,
        sender: boss.name,
        role: 'boss',
        text: reply,
        timestamp: Date.now(),
      },
    });

    options.onHookEvent?.('antigravity', {
      session_id: boss.sessionId,
      hook_event_name: 'PreToolUse',
      tool_name: 'speak',
      tool_input: { message: reply },
      cwd: bossDir,
    });
  }

  // If this was purely conversation/greeting/query, finish and keep Boss speech visible
  if (!isDirective || subtasks.length === 0) {
    await sleep(2500);
    if (boss) {
      options.onHookEvent?.('antigravity', {
        session_id: boss.sessionId,
        hook_event_name: 'Stop',
        awaiting_input: true,
        cwd: bossDir,
      });
      options.store.broadcast({
        type: 'agentSpeech',
        id: boss.id,
        text: reply,
        sender: boss.name,
        role: 'boss',
        timestamp: Date.now(),
      });
    }
    return { isDirective: false, reply, tasks: [] };
  }

  // 3. Otherwise, Boss orders workers
  await sleep(1200);
  if (boss) {
    options.onHookEvent?.('antigravity', {
      session_id: boss.sessionId,
      hook_event_name: 'PreToolUse',
      tool_name: 'order_workers',
      tool_input: { order: `Delegating ${subtasks.length} tasks for: ${order}` },
      cwd: bossDir,
    });
  }

  // 4. Only assigned workers activate on their tasks
  for (let i = 0; i < subtasks.length; i++) {
    const task = subtasks[i] as DecomposedTask;
    const worker = workers.find(
      (w) =>
        w.name.toLowerCase() === task.employee.toLowerCase() ||
        (task.employee.toLowerCase() === 'joy' && w.name.toLowerCase() === 'roy') ||
        w.name.toLowerCase().includes(task.employee.toLowerCase()),
    );
    if (!worker) continue;

    // ── Resolve worker's dedicated folder (ALWAYS write there) ──────────────
    const wsData = getEmployeeWorkspace(worker.name);
    const assignedRel = wsData.assignedFolder || worker.name;
    const workerDir = path.resolve(rootDir, assignedRel);
    if (!fs.existsSync(workerDir)) {
      fs.mkdirSync(workerDir, { recursive: true });
    }

    // ── Determine output filename — always inside workerDir ─────────────────
    let base = (task.fileName || '').trim();
    // Strip any path prefix the Boss may have added (keep only the filename)
    if (base.includes('/') || base.includes('\\')) base = path.basename(base);
    // Reject generic placeholder names and re-infer
    if (!base || ['task_output.txt', 'output.txt', 'solution.txt', 'desktop_file.txt', 'output.js'].includes(base)) {
      base = inferFileNameFromOrder(order);
    }
    const destPath = path.join(workerDir, base);
    const displayDest = `${assignedRel}/${base}`;

    // ── Always read workspace context BEFORE generating/using code ──────────
    let existingFiles: string[] = [];
    try {
      existingFiles = fs.readdirSync(workerDir)
        .filter((f) => !f.startsWith('.') && f !== 'node_modules')
        .slice(0, 20);
    } catch { /* ignore */ }

    const isRunCommand = task.tool === 'run_command' || Boolean(task.command);

    if (isRunCommand) {
      // ── Execute shell command in worker's dedicated folder ─────────────────
      let cmd = task.command || inferCommandFromOrder(order, workerDir).command || task.action;
      if (cmd.startsWith('Run:') || cmd.startsWith('Execute:')) {
        cmd = cmd.replace(/^(?:Run|Execute):\s*/i, '');
      }
      console.log(`[BossService] ${worker.name} running command: "${cmd}" in ${workerDir}`);

      options.onHookEvent?.('antigravity', {
        session_id: worker.sessionId,
        hook_event_name: 'PreToolUse',
        tool_name: 'run_command',
        tool_input: { CommandLine: cmd },
        cwd: workerDir,
      });

      let cmdOutput = '';
      try {
        const isWindows = process.platform === 'win32';
        const result = isWindows
          ? childProcess.spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], {
              cwd: workerDir,
              timeout: 30000,
              encoding: 'utf-8',
            })
          : childProcess.spawnSync(cmd, {
              shell: true,
              cwd: workerDir,
              timeout: 30000,
              encoding: 'utf-8',
            });
        cmdOutput = (result.stdout || '') + (result.stderr || '');
        if (result.error) cmdOutput += `\nError: ${result.error.message}`;
      } catch (cmdErr) {
        cmdOutput = `Command failed: ${(cmdErr as Error).message}`;
        console.warn(`[BossService] Shell exec error:`, cmdErr);
      }

      const trimmedOutput = cmdOutput.trim() || '(Command executed successfully with no output)';

      // Also persist to task_output.txt so employee workspace has an audit log
      const taskOutputFile = path.join(workerDir, 'task_output.txt');
      try {
        fs.writeFileSync(taskOutputFile, `Command: ${cmd}\nTimestamp: ${new Date().toISOString()}\n\nOutput:\n${trimmedOutput}\n`, 'utf-8');
      } catch { /* ignore */ }

      // Record deed
      recordEmployeeDeed(worker.name, {
        task: task.action,
        order,
        fileName: 'task_output.txt',
        fullPath: taskOutputFile,
        fileSize: Buffer.byteLength(trimmedOutput),
        summary: `Executed: ${cmd} — ${trimmedOutput.slice(0, 100).replace(/\r?\n/g, ' ')}`,
      });

      await sleep(800);
      const speechText = `Ran: ${cmd.slice(0, 45)} ✅`;

      options.store.broadcast({
        type: 'agentSpeech',
        id: worker.id,
        text: speechText,
        sender: worker.name,
        role: worker.role,
        timestamp: Date.now(),
      });

      options.store.broadcast({
        type: 'intercomMessage',
        message: {
          id: `msg-${Date.now()}-${worker.id}-cmd`,
          sender: `${worker.name} (${worker.role})`,
          role: 'employee',
          text: `⚡ Executed in PowerShell: \`${cmd}\`\n\n\`\`\`\n${trimmedOutput.slice(0, 800)}${trimmedOutput.length > 800 ? '\n...(truncated)' : ''}\n\`\`\``,
          timestamp: Date.now(),
        },
      });

      options.onHookEvent?.('antigravity', {
        session_id: worker.sessionId,
        hook_event_name: 'PostToolUse',
        tool_name: 'run_command',
        cwd: workerDir,
      });

      continue; // skip file-writing flow for run_command tasks
    }

    // ── File-creation task ──────────────────────────────────────────────────
    let fileContent = task.code;
    const isGenericContent = !fileContent ||
      fileContent.trim().length === 0 ||
      fileContent.includes('Completed successfully') ||
      fileContent.includes('=========================================') ||
      fileContent.trim().startsWith('//');

    // Always re-generate with full workspace context for richer, context-aware output
    if (apiKey && (isGenericContent || existingFiles.length > 0 || wsData.pastDeeds.length > 0)) {
      fileContent = await generateWorkerFileContent(apiKey, worker, task.action, order, destPath, {
        assignedFolder: assignedRel,
        existingFiles,
        pastDeeds: wsData.pastDeeds,
      });
    } else if (!fileContent || fileContent.trim().length === 0) {
      fileContent = `// Implementation by ${worker.name} (${worker.role})\n// Directive: ${task.action}\n`;
    }

    fs.writeFileSync(destPath, fileContent, 'utf-8');
    console.log(`[BossService] ${worker.name} → ${destPath} (${fileContent.length} bytes)`);

    // ── Record deed for persistent context memory ───────────────────────────
    recordEmployeeDeed(worker.name, {
      task: task.action,
      order,
      fileName: base,
      fullPath: destPath,
      fileSize: fileContent.length,
      summary: `Created ${base} (${fileContent.length} bytes) for: "${task.action}"`,
    });

    await sleep(800);

    const speechText = `Finished ${base} in [${assignedRel}]!`;

    options.store.broadcast({
      type: 'agentSpeech',
      id: worker.id,
      text: speechText,
      sender: worker.name,
      role: worker.role,
      timestamp: Date.now(),
    });

    options.store.broadcast({
      type: 'intercomMessage',
      message: {
        id: `msg-${Date.now()}-${worker.id}`,
        sender: `${worker.name} (${worker.role})`,
        role: 'employee',
        text: `📁 Created \`${base}\` (${fileContent.length} bytes) in \`${displayDest}\`\n${task.detail || task.action}`,
        timestamp: Date.now(),
      },
    });

    options.onHookEvent?.('antigravity', {
      session_id: worker.sessionId,
      hook_event_name: 'PreToolUse',
      tool_name: 'write_to_file',
      tool_input: { TargetFile: destPath },
      cwd: workerDir,
    });
  }

  await sleep(3000);

  // 5. Only assigned workers complete their tasks and stand by
  for (const task of subtasks) {
    const worker = workers.find(
      (w) =>
        w.name.toLowerCase() === task.employee.toLowerCase() ||
        (task.employee.toLowerCase() === 'joy' && w.name.toLowerCase() === 'roy') ||
        w.name.toLowerCase().includes(task.employee.toLowerCase()),
    );
    if (!worker) continue;

    const workerDir = path.join(rootDir, worker.name);

    options.onHookEvent?.('antigravity', {
      session_id: worker.sessionId,
      hook_event_name: 'Stop',
      awaiting_input: true,
      cwd: workerDir,
    });

    const completionMsg = `Completed! File saved to ${task.targetPath || task.fileName}.`;

    options.store.broadcast({
      type: 'agentSpeech',
      id: worker.id,
      text: completionMsg,
      sender: worker.name,
      role: worker.role,
      timestamp: Date.now(),
    });

    options.store.broadcast({
      type: 'intercomMessage',
      message: {
        id: `msg-${Date.now()}-done-${worker.id}`,
        sender: worker.name,
        role: 'employee',
        text: completionMsg,
        timestamp: Date.now(),
      },
    });
  }

  // 6. Boss completes and returns to waiting
  await sleep(800);
  if (boss) {
    options.onHookEvent?.('antigravity', {
      session_id: boss.sessionId,
      hook_event_name: 'Stop',
      awaiting_input: true,
      cwd: bossDir,
    });
    options.store.broadcast({
      type: 'agentSpeech',
      id: boss.id,
      text: `Directives successfully delivered to workspace! Standing by for next orders.`,
      sender: boss.name,
      role: 'boss',
      timestamp: Date.now(),
    });
  }

  return { isDirective: true, reply, tasks: subtasks };
}
