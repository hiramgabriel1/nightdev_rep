# Nightdev

<div align="center">
  <img src="public/nightdev.png" alt="Nightdev Logo" width="200" />
</div>

> Build software from your pocket. A Telegram bot powered by AI agents.

[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

Nightdev is a Telegram bot that lets you program and build software directly from your phone using AI agents. It connects to a remote VPS to execute commands and deliver results instantly in your chat.

## ✨ Features

- **Multi-Agent Pipeline** — Three specialized agents work together to build, test, and commit your code:
  - 🔨 **Builder** — Generates clean, functional code
  - 🧪 **Tester** — Reviews and verifies the code (auto-retries up to 3 times on failure)
  - 📦 **Committer** — Creates meaningful git commits with Conventional Commits format
- **Approval Workflow** — Review the pipeline report and approve or reject before committing
- **Bring Your Own Bot** — Connect your own OpenClaw API key and Telegram Bot token to run a personalized bot.
- **Rate Limiting** — Built-in protection against spam (10 messages/min per user).
- **Persistent Storage** — User data and preferences stored in PostgreSQL via Prisma.
- **Auto-recovery** — Robust polling error handling and auto-reconnect.

## 🏗 Architecture

```
Telegram Client  →  Nightdev Bot (Node.js)  →  OpenClaw (SSH on VPS)
                        ↓                          ↓
                   PostgreSQL (Prisma)      ┌── Builder
                                            ├── Tester
                                            └── Committer
```

### Pipeline Flow

```
User: "Create a REST API with Express"
   ↓
1. 🔨 Builder generates the code
   ↓
2. 🧪 Tester verifies → PASS ✅ or FAIL ❌
   ↓ (if FAIL, retry up to 3 times)
3. 📦 Bot sends report with Approve/Reject buttons
   ↓
4. User approves → 📦 Committer creates git commit
```

## 📋 Prerequisites

- **Node.js** v20 or higher
- **pnpm** v8 or higher
- **PostgreSQL** database
- **OpenClaw** installed on a remote VPS with multiple agents configured

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/nightdev.git
cd nightdev
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Your Telegram Bot token from @BotFather |
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENCLAW_GATEWAY_TOKEN` | Token for OpenClaw Gateway |
| `VPS_HOST` | SSH host for the VPS (default: 159.203.189.5) |

### 4. Setup database

```bash
pnpm prisma generate
pnpm prisma db push
```

### 5. Run the bot

**Development** (with auto-reload):
```bash
pnpm dev
```

**Production**:
```bash
pnpm build
pnpm start
```

## 📂 Project Structure

```
nightdev/
├── src/
│   ├── index.ts          # Entrypoint & bot initialization
│   ├── commands.ts       # /start, /help handlers & pipeline callbacks
│   ├── handlers.ts       # Message processing & rate limiting
│   ├── pipeline.ts       # Multi-agent pipeline orchestrator
│   ├── openclaw.ts       # SSH service for OpenClaw execution
│   ├── db.ts             # Prisma client instance
│   └── logger.ts         # Typed logger with levels
├── prisma/
│   └── schema.prisma     # Database schema
├── .env.example          # Environment template
├── package.json
└── tsconfig.json
```

## 🛠 Tech Stack

- **Runtime**: Node.js (ESM)
- **Language**: TypeScript
- **Bot Framework**: node-telegram-bot-api
- **Database**: PostgreSQL + Prisma ORM
- **Rate Limiting**: rate-limiter-flexible
- **SSH Client**: ssh2
- **AI Agents**: OpenClaw (multi-agent)
- **Development**: tsx

## 📄 License

ISC
