<div align="center">
  <img src="public/nightdev-removebg-preview.png" alt="Nightdev Logo" width="200" />
  <br/>
  <h1>Nightdev</h1>
  <blockquote>Build software from your pocket. A Telegram bot powered by AI agents.</blockquote>
  <br/>
  <p>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5+-blue.svg" alt="TypeScript"></a>
    <a href="https://www.prisma.io/"><img src="https://img.shields.io/badge/Prisma-ORM-2D3748.svg" alt="Prisma"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-yellow.svg" alt="License"></a>
  </p>
</div>

Nightdev is a Telegram bot that lets you build software from your phone using AI agents on a remote VPS.

## ✨ Features

- **Multi-agent pipeline** — Greetings go to main agent; build requests run through builder → tester agents
- **Auto-provisioning** — New users get their own isolated Docker container on first message (no manual setup)
- **PM2 auto-restart** — Container bridge managed by PM2; auto-recovers from crashes
- **Rate limiting** — Built-in protection against spam (10 messages/min per user)
- **Persistent storage** — User data stored in PostgreSQL via Prisma

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
                                          ┌─ PM2 (auto-restart)
                                          ├─ Container Bridge (Node.js)
                                          └─ Gateway WebSocket (:18789)
                                                   ↓
                                              OpenClaw Agents
                                                 ┌── main (conversation)
                                                 ├── builder (build code)
                                                 ├── tester (verify code)
                                                 └── committer (git ops)
```

The bot runs locally and connects to a **master bridge** on the VPS. Each Telegram user gets their own isolated Docker container with a dedicated OpenClaw gateway + bridge. The bridge process is managed by **PM2** for automatic crash recovery.

New users are **auto-provisioned** — the master bridge creates the container, workspace, and configuration on first message.

## 🚀 VPS Setup (One Command)

```bash
curl -fsSL https://raw.githubusercontent.com/hiramgabriel1/nightdev_rep/main/scripts/setup.sh | bash
```

This script provisions a fresh VPS with everything needed:
- Docker image with OpenClaw gateway + PM2 bridge
- Master bridge (auto-provisioning per-user containers)
- Systemd service for auto-start on boot
- First user (nightdev) ready to go

**Requires:** Docker, Node.js 20+, and an Opencode API key (for AI agents).

## 📋 Local Prerequisites

- **Node.js** v20 or higher
- **pnpm** v8 or higher
- **PostgreSQL** database

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

### 6. Run with Docker (alternative)

```bash
# Build image
docker build -t nightdev-bot .

# Run (mount .env with your config)
docker run -d \
  --name nightdev-bot \
  --env-file .env \
  --network host \
  --restart unless-stopped \
  nightdev-bot
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
│   │   ├── openclaw.ts       # HTTP client for the VPS master bridge
│   │   └── security.ts       # Output sanitization
│   └── core/
│       ├── db.ts             # Prisma client instance
│       └── logger.ts         # Typed logger with levels
├── scripts/
│   └── setup.sh              # One-command VPS bootstrap script
├── prisma/
│   └── schema.prisma         # Database schema
├── public/
│   └── nightdev-removebg-preview.png
├── Dockerfile                # Multi-stage build for Docker deployment
├── .env.example              # Environment template
├── package.json
├── tsconfig.json
└── opencode.json             # AI agent configuration
```

##  Tech Stack

- **Runtime**: Node.js (ESM)
- **Language**: TypeScript
- **Bot Framework**: node-telegram-bot-api
- **Database**: PostgreSQL + Prisma ORM
- **Rate Limiting**: rate-limiter-flexible
- **AI Agents**: OpenClaw on VPS (multi-agent: main, builder, tester, committer)
- **Bridge**: Persistent Node.js HTTP → WebSocket gateway proxy
- **Process Management**: PM2 inside Docker containers (auto-restart)
- **Orchestration**: Docker Compose + systemd (triple-layer recovery)
- **Secrets**: `.env` files per user, `.gitignore`-d
- **Development**: tsx (watch mode)

## 🤝 Contributing

Found a bug? [Open an issue](https://github.com/hiramgabriel1/nightdev_rep/issues). Want to add something? Fork the repo and send a pull request.

## 📄 License

ISC
