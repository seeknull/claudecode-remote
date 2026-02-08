# Claude Code Remote

A web interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Run Claude Code on a machine and access it from any browser — on your phone, tablet, or another computer.

![Demo](https://raw.githubusercontent.com/seeknull/claudecode-remote/main/content/demo1.gif)

## What it does

- Chat with Claude about your code projects through a browser
- Claude can read, edit, and create files in your projects (with permission prompts)
- View file diffs, git status, and tool activity in real-time
- Browse and resume sessions started from the CLI or VS Code
- Multiple sessions, multiple projects, multiple tabs — all supported
- Password-protected access with JWT authentication

## Privacy & security

- **Everything runs locally on your machine.** No data is sent to any third-party server. Your code, sessions, and credentials never leave your device.
- **No API keys needed in this project.** It uses your existing Claude Code CLI authentication. If `claude` works in your terminal, this works too.
- **Password-protected.** Access is gated behind a password you set on first launch. Credentials are stored locally in `~/.claude-code-remote/`.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`claude` must be in your PATH)

## Quick start

### Option 1: From source (recommended)

```bash
git clone https://github.com/seeknull/claudecode-remote.git
cd claudecode-remote
npm install
npm start
```

### Option 2: npm package

```bash
npm install -g @seeknull/claudecode-remote
claudecode-remote
```

The server starts on `http://localhost:3001`. On first visit, you'll be asked to set a password.

Custom port: `PORT=8080 npm start` or `PORT=8080 claudecode-remote`

## Remote access

To access from another device, expose the server with a tunnel like [ngrok](https://ngrok.com/):

```bash
ngrok http 3001
```

Or with a stable domain:

```bash
ngrok http --domain=your-domain.ngrok-free.app 3001
```

## How it works

The server wraps the `@anthropic-ai/claude-agent-sdk`. Each chat message spawns a Claude Code process on your machine. Sessions persist across page refreshes and reconnections.

Your projects are discovered automatically from `~/.claude/projects/` — any directory where you've previously used Claude Code will appear.

## Development

```bash
git clone https://github.com/seeknull/claudecode-remote.git
cd claudecode-remote
npm install
npm run dev
```

This starts both the server (port 3001) and the Vite dev server (port 5174) with hot reload.

## Password reset

Delete the runtime config and restart:

```bash
# macOS / Linux
rm ~/.claude-code-remote/runtime.json

# Windows (PowerShell)
Remove-Item "$env:USERPROFILE\.claude-code-remote\runtime.json"
```

## Issues & feedback

Found a bug or have a feature request? [Open an issue](https://github.com/seeknull/claudecode-remote/issues).

## License

MIT
