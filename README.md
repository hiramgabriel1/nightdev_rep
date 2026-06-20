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

Nightdev is a Telegram bot that builds software for you. Tell it what you want in plain language — it codes it, tests it, and pushes it to GitHub. All from your phone.

## ✨ What it can do

- **Build anything** — APIs, scripts, landing pages, bots, microservices, whatever you describe
- **Commit to GitHub** — Creates repos, pushes code, manages branches. Just say "commit this"
- **Multiple agents** — A main agent orchestrates builders, testers, and committers automatically
- **Free tokens** — 100,000 tokens free for every new user to try it out
- **Bring your own model** — Use your own API key (Anthropic, OpenAI, Gemini, DeepSeek, and more) via `/config`
- **Per-user isolation** — Each person gets their own Docker container with dedicated AI agents
- **Auto-provisioning** — New users are set up automatically on first message, no manual config
- **GitHub integration** — Connect your repo, add the deploy key, and the bot commits code for you
- **Privacy first** — Your API keys are never exposed, logged, or shared. See [SECURITY.md](SECURITY.md)
- **One-command VPS setup** — A single script provisions the entire infrastructure

## How it works

```
You (Telegram) → Nightdev Bot → Master Bridge (VPS) → Your Container → AI Agents
                                                                              ↓
                                                                    Code → Test → GitHub
```

You message the bot on Telegram. It sends your request to your personal container on the VPS, where AI agents build, review, and commit your code. Everything is isolated per user.

### Token system

Every new user gets **100,000 free tokens** to use with the default model. Token usage is estimated from message length (≈4 chars = 1 token). Build requests cost more because they run multiple agents (builder + tester).

When your free tokens run out, you can bring your own API key via `/config` — the bot updates your container to use your provider and model.

### Commands

| Command | Description |
|---|---|
| `/start` | Welcome message with token info |
| `/config` | Switch between Nightdev mode and your own API key |
| `/status` | View your current config and remaining tokens |
| `/repo <url>` | Connect a GitHub repository |
| `/githubtoken <token>` | Set your GitHub personal access token for commits |
| `/deploykey` | Get the SSH deploy key for GitHub |
| `/language` | Toggle between English and Spanish |
| `/help` | Show all commands |

## 🚀 VPS Setup

### Dokploy

The VPS runs [Dokploy](https://dokploy.com) — an open-source PaaS on top of Docker Swarm for managing containers, deployments, and SSL certificates.

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Then access `http://your-vps-ip:3000` to create the admin account.

### One-command user setup

Once Dokploy is running, the master bridge handles per-user provisioning:

```bash
curl -fsSL https://raw.githubusercontent.com/hiramgabriel1/nightdev_rep/main/scripts/setup.sh | bash
```

This provisions the OpenClaw gateway, PM2 bridge, and auto-starts containers for new users.

**Requires:** Docker, Node.js 20+, and an Opencode API key.

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

## 🏗️ Infrastructure

Infrastructure is managed as code with Terraform at `infra/`:

| File | Purpose |
|---|---|
| `main.tf` | Droplet + firewall rules |
| `variables.tf` | Configurable variables (region, size, admin IP) |
| `outputs.tf` | Outputs (droplet IP, URN) |

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your DO token, SSH key name, admin IP
terraform init
terraform apply
```

Firewall restricts admin ports (SSH, Dokploy panel) to only your IP. Public ports (80, 443) are open for Traefik/HTTPS.

## 📂 Project Structure

```
nightdev/
├── src/
│   ├── index.ts              # Entrypoint & bot initialization
│   ├── cli/
│   │   └── index.ts          # Interactive CLI for configuration
│   ├── bot/
│   │   ├── commands.ts       # /start, /status, /config, /language, /help handlers
│   │   └── handlers.ts       # Message processing
│   ├── services/
│   │   ├── anti-abuse.ts     # Automatic abuse detection (rapid token burn, repo dupes)
│   │   ├── openclaw.ts       # HTTP client for the VPS master bridge
│   │   ├── security.ts       # Output sanitization (API key redaction)
│   │   └── tokens.ts         # Token usage estimation
│   └── core/
│       ├── db.ts             # Prisma client instance
│       ├── i18n.ts           # Localization (en/es) message dictionary
│       └── logger.ts         # Typed logger with levels
├── infra/
│   ├── main.tf               # Terraform: droplet + firewall
│   ├── variables.tf          # Configurable vars
│   ├── outputs.tf            # Outputs
│   └── terraform.tfvars.example
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
- **AI Agents**: OpenClaw on VPS (multi-agent: main, builder, tester, committer)
- **Bridge**: Persistent Node.js HTTP → WebSocket gateway proxy
- **Process Management**: PM2 inside Docker containers
- **Orchestration**: Docker Swarm (Dokploy) + systemd
- **PaaS**: Dokploy (open-source, container management + SSL)
- **Infrastructure as Code**: Terraform (DigitalOcean provider)
- **Development**: tsx (watch mode)

## 🤝 Contributing

Found a bug? [Open an issue](https://github.com/hiramgabriel1/nightdev_rep/issues). Want to add something? Fork the repo and send a pull request.

## 📄 License

ISC
