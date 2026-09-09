import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=');
      const val = v.join('=').trim();
      process.env[k.trim()] = val;
    }
  }
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

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
  return { port: 3100, token: '' };
}

function sendHookEvent(server, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.port,
        path: '/api/hooks/antigravity',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Authorization: `Bearer ${server.token}`,
        },
        timeout: 2000,
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
    req.end(data);
  });
}

function callGemini(prompt) {
  return new Promise((resolve, reject) => {
    if (!GEMINI_API_KEY) {
      reject(new Error('GEMINI_API_KEY is not set in .env'));
      return;
    }

    const payload = JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                'You are the executive BOSS of an AI engineering team with 2 employees:\n' +
                '1. Employee 1 (Alice): Senior Fullstack Engineer who builds, architects, and writes code.\n' +
                '2. Employee 2 (Bob): QA & Testing Specialist who inspects files, runs tests, and validates code.\n\n' +
                'Given an order from the Director, decompose it into exactly 2 concrete assignments, one for Employee 1 and one for Employee 2.\n' +
                'Respond strictly with valid JSON without markdown wrapping. Format:\n' +
                '[\n' +
                '  {\n' +
                '    "employee": "Employee 1 (Alice)",\n' +
                '    "action": "Brief title of the implementation task",\n' +
                '    "tool": "replace_file_content",\n' +
                '    "detail": "Detailed code change or creation"\n' +
                '  },\n' +
                '  {\n' +
                '    "employee": "Employee 2 (Bob)",\n' +
                '    "action": "Brief title of the QA/testing task",\n' +
                '    "tool": "run_command",\n' +
                '    "detail": "Running test suite and validation"\n' +
                '  }\n' +
                ']\n\n' +
                `Director's Order: ${prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;
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
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
              reject(new Error(`Invalid response from Gemini API: ${body}`));
              return;
            }
            resolve(text);
          } catch (e) {
            reject(new Error(`Failed to parse Gemini response: ${e.message}`));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BOSS_SESSION = 'kibee-boss-session';
const EMP1_SESSION = 'kibee-employee-1-session';
const EMP2_SESSION = 'kibee-employee-2-session';

const BOSS_DIR = path.join(__dirname, 'Boss');
const EMP1_DIR = path.join(__dirname, 'Employee-1');
const EMP2_DIR = path.join(__dirname, 'Employee-2');

async function setAgentWaiting(server, sessionId, cwd, promptText) {
  // First send PreToolUse to awaken character and set position
  await sendHookEvent(server, {
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: 'ask_question',
    tool_input: { question: promptText },
    cwd,
  });
  await sleep(150);
  // Then send Stop with awaiting_input: true so they sit at their desk in waiting state
  await sendHookEvent(server, {
    session_id: sessionId,
    hook_event_name: 'Stop',
    awaiting_input: true,
    cwd,
  });
}

async function initializeOffice(server) {
  console.log('🏢 Initializing KiBee Office with Boss & 2 Employees...');

  // 1. Spawn Boss at desk, waiting for commands
  console.log('👑 Seating Boss at executive desk...');
  await setAgentWaiting(server, BOSS_SESSION, BOSS_DIR, 'Ready for Director orders');

  // 2. Spawn Employee 1 (Alice)
  console.log('👩‍💻 Seating Employee 1 (Alice - Fullstack Engineer)...');
  await setAgentWaiting(server, EMP1_SESSION, EMP1_DIR, 'Standing by for Boss assignments');

  // 3. Spawn Employee 2 (Bob)
  console.log('👨‍💻 Seating Employee 2 (Bob - QA & Testing)...');
  await setAgentWaiting(server, EMP2_SESSION, EMP2_DIR, 'Standing by for Boss assignments');

  console.log(
    '\n✨ All 3 agents are seated at their workstations in the office, waiting for commands!\n',
  );
}

async function main() {
  console.log('===============================================================');
  console.log('      KiBee Agent Office: Boss & 2 Employees (Gemini 2.5)      ');
  console.log('===============================================================');
  console.log('');

  const server = findActiveServer();
  console.log(`🔌 Office Server connected at port ${server.port}\n`);

  await initializeOffice(server);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptLoop = () => {
    rl.question('👔 BOSS CONSOLE > Enter order for team (or "exit") > ', async (input) => {
      const order = input ? input.trim() : '';
      if (!order || order.toLowerCase() === 'exit') {
        console.log('\nDismissing office and shutting down.');
        rl.close();
        process.exit(0);
      }

      console.log(`\n📢 [BOSS]: "Attention team! New directive from leadership: ${order}"`);

      // 1. Boss indicates active thinking/planning with Gemini
      await sendHookEvent(server, {
        session_id: BOSS_SESSION,
        hook_event_name: 'PreToolUse',
        tool_name: 'think',
        tool_input: { thought: `Strategizing breakdown for: ${order}` },
        cwd: BOSS_DIR,
      });

      let subtasks = [];
      try {
        console.log('🧠 Boss is consulting Gemini 2.5 Flash to decompose the tasks...');
        const geminiOutput = await callGemini(order);
        const cleanJson = geminiOutput
          .replace(/^```json/m, '')
          .replace(/```$/m, '')
          .trim();
        subtasks = JSON.parse(cleanJson);
      } catch (err) {
        console.warn(`⚠️  Gemini planning fallback: ${err.message}`);
        subtasks = [
          {
            employee: 'Employee 1 (Alice)',
            action: `Implement: ${order}`,
            tool: 'replace_file_content',
            detail: `Code implementation for ${order}`,
          },
          {
            employee: 'Employee 2 (Bob)',
            action: `Verify & Test: ${order}`,
            tool: 'run_command',
            detail: `Test validation for ${order}`,
          },
        ];
      }

      // 2. Boss announces orders to team
      await sendHookEvent(server, {
        session_id: BOSS_SESSION,
        hook_event_name: 'PreToolUse',
        tool_name: 'order_workers',
        tool_input: { order: `Delegating 2 tasks for: ${order}` },
        cwd: BOSS_DIR,
      });
      await sleep(1500);

      const task1 = subtasks[0] || { action: 'Development work', tool: 'replace_file_content' };
      const task2 = subtasks[1] || { action: 'QA & Testing', tool: 'run_command' };

      console.log(`\n📋 Assignments:`);
      console.log(`   🔹 Employee 1 (Alice): ${task1.action}`);
      console.log(`   🔹 Employee 2 (Bob):   ${task2.action}\n`);

      // 3. Employee 1 starts coding
      console.log('⚡ [Employee 1 (Alice)] executing assignment...');
      await sendHookEvent(server, {
        session_id: EMP1_SESSION,
        hook_event_name: 'PreToolUse',
        tool_name: task1.tool || 'replace_file_content',
        tool_input: { TargetFile: `${task1.action}.ts` },
        cwd: EMP1_DIR,
      });

      await sleep(2500);

      // 4. Employee 2 starts testing & validating
      console.log('⚡ [Employee 2 (Bob)] executing assignment...');
      await sendHookEvent(server, {
        session_id: EMP2_SESSION,
        hook_event_name: 'PreToolUse',
        tool_name: task2.tool || 'run_command',
        tool_input: { CommandLine: task2.action },
        cwd: EMP2_DIR,
      });

      await sleep(2500);

      // 5. Employee 1 finishes & returns to desk
      console.log('✅ [Employee 1 (Alice)] finished implementation!');
      await setAgentWaiting(
        server,
        EMP1_SESSION,
        EMP1_DIR,
        'Task complete! Waiting for next order',
      );

      // 6. Employee 2 finishes & returns to desk
      console.log('✅ [Employee 2 (Bob)] finished QA validation!');
      await setAgentWaiting(
        server,
        EMP2_SESSION,
        EMP2_DIR,
        'Verification passed! Waiting for next order',
      );

      await sleep(1000);

      // 7. Boss reports completion to Director and returns to waiting state
      console.log('\n🎉 [BOSS]: "Director, the team has successfully completed all tasks!"\n');
      await setAgentWaiting(server, BOSS_SESSION, BOSS_DIR, 'Team ready for your next order');

      promptLoop();
    });
  };

  promptLoop();
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
