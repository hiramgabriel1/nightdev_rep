# Nightdev

<div align="center">
  <img src="public/nightdev-removebg-preview.png" alt="Nightdev Logo" width="200" />
</div>

> Build software from your pocket. A Telegram bot powered by AI agents.

[![Node](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

Nightdev is a Telegram bot that lets you build software from your phone using AI agents on a remote VPS.

## ✨ Features

- **Single-agent execution** — Messages are sent directly to an OpenClaw main agent that orchestrates the work
- **Nightdev mode** — Uses Nightdev's own OpenClaw gateway with curated models (no API key needed)
- **Bring your own provider** — Supports Claude, OpenAI, Gemini, DeepSeek, Mistral, Groq, and more
- **Rate limiting** — Built-in protection against spam (10 messages/min per user)
- **Persistent storage** — User data stored in PostgreSQL via Prisma
- **Auto-recovery** — Robust polling error handling and auto-reconnect

##  Architecture

```
Telegram Client  →  Nightdev Bot (Node.js)  →  Master Bridge (VPS :18790)
                                                   ↓
                                           (routes by user_id)
                                                   ↓
                                          ┌── nd-nightdev (:18791)
                                          ├── nd-u{telegram_id} (:18792)
                                          ├── nd-u{telegram_id} (:18793)
                                          └── ... (auto-provisioned per user)
                                                   ↓
                                         Container Bridge → Gateway WebSocket (:18789)
                                                   ↓
                                              OpenClaw Agents
                                                 ┌── main
                                                 ├── builder
                                                 ├── tester
                                                 └── committer
```

The bot runs locally and connects to a **master bridge** on the VPS. Each Telegram user gets their own isolated Docker container with a dedicated OpenClaw gateway + bridge. New users are **auto-provisioned** — the master bridge creates the container, workspace, and configuration on first message.

## 📋 Prerequisites

- **Node.js** v20 or higher
- **pnpm** v8 or higher
- **PostgreSQL** database
- **OpenClaw** gateway running on a VPS with an HTTP bridge

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
| `OPENCLAW_BRIDGE_HOST` | VPS IP or hostname |
| `OPENCLAW_BRIDGE_PORT` | Bridge port |
| `OPENCLAW_BRIDGE_TOKEN` | Auth token for the bridge |

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
│   ├── index.ts              # Entrypoint & bot initialization
│   ├── cli/
│   │   └── index.ts          # Interactive CLI for configuration
│   ├── bot/
│   │   ├── commands.ts       # /start, /status, /config, /help handlers
│   │   └── handlers.ts       # Message processing & rate limiting
│   ├── services/
│   │   ├── openclaw.ts       # HTTP client for the VPS bridge
│   │   └── security.ts       # Output sanitization
│   └── core/
│       ├── db.ts             # Prisma client instance
│       └── logger.ts         # Typed logger with levels
├── prisma/
│   └── schema.prisma         # Database schema
├── public/
│   └── nightdev-removebg-preview.png
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
```

##  Tech Stack

- **Runtime**: Node.js (ESM)
- **Language**: TypeScript
- **Bot Framework**: node-telegram-bot-api
- **Database**: PostgreSQL + Prisma ORM
- **Rate Limiting**: rate-limiter-flexible
- **AI Agents**: OpenClaw on VPS
- **Bridge**: Persistent Node.js HTTP → WebSocket gateway proxy
- **Development**: tsx (watch mode)

## 🤝 Contributing

Found a bug? [Open an issue](https://github.com/hiramgabriel1/nightdev_rep/issues). Want to add something? Fork the repo and send a pull request.

## 📄 License

ISC
