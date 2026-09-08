# KiBee Agent Office (Pixel Agents + Gemini & Antigravity)

Pixel Agents setup with full support for **Google Antigravity (`agy`)** and **Gemini API**.

## What Has Been Configured

1. **KiBee-Agent-Office Workspace**:
   - Location: `F:\KiBee-Agent-Office`
   - Installed all npm dependencies and successfully compiled all assets, webview, and server.

2. **Gemini API Configuration**:
   - Stored your Gemini API Key in [`.env`](file:///f:/KiBee-Agent-Office/.env) as `GEMINI_API_KEY` and `GOOGLE_API_KEY`.
   - Loaded automatically by launcher scripts and Antigravity agents.

3. **Antigravity CLI (`agy`) Hook Integration**:
   - Implemented `antigravity` provider in [`server/src/providers/hook/antigravity/`](file:///f:/KiBee-Agent-Office/server/src/providers/hook/antigravity/).
   - Generated hook bundle at `dist/hooks/antigravity-hook.js` and installed to `~/.pixel-agents/hooks/antigravity-hook.js`.
   - Registered Antigravity hook configuration in `~/.gemini/config/plugins/kibee-pixel-agents/hooks.json`.
   - Whenever an Antigravity agent or `agy` CLI executes a tool, status events (`PreToolUse`, `PostToolUse`, `Stop`) are posted in real-time to the Pixel Agents office, animating characters as they type, read, or wait for input.

---

## How to Run

### Option 1: Double-Click Launchers (Easiest)

1. **Start the Pixel Agents Office**:
   Double click [`start-office.bat`](file:///f:/KiBee-Agent-Office/start-office.bat) (or run `./start-office.ps1`).
   - The terminal will display the local URL with your session token, e.g.:
     `http://127.0.0.1:3100/?token=...`
   - Open that URL in your browser to enter your virtual pixel office!

2. **Run an Agent**:
   Double click [`start-agent.bat`](file:///f:/KiBee-Agent-Office/start-agent.bat) (or run `agy` in any terminal).
   - As your agent works, it will appear as an animated character in the office, walking to desks, typing code, searching, or displaying thought/speech bubbles!

### Option 2: Command Line

To start the office on port 3100:
```powershell
cd F:\KiBee-Agent-Office
node dist/cli.js --port 3100
```

To re-install or update hooks at any time:
```powershell
node scripts/setup-antigravity.js
```
