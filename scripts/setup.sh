#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Nightdev VPS Setup - Automated Infrastructure
# ──────────────────────────────────────────────
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/hiramgabriel1/nightdev_rep/main/scripts/setup.sh | bash
#
# Requires: Docker, Node.js 20+, curl
# ──────────────────────────────────────────────

NIGHTDEV_DIR="/opt/nightdev"
USERS_DIR="${NIGHTDEV_DIR}/users"
COMPOSE_DIR="${NIGHTDEV_DIR}"
IMAGES_DIR="${NIGHTDEV_DIR}/images/base"
BRIDGE_PORT="18790"
MASTER_TOKEN="${NIGHTDEV_BRIDGE_TOKEN:-nightdev-bridge-2026}"
OPENCODE_API_KEY="${OPENCODE_API_KEY:-}"

# ── Colors ────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ok]${NC} $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $1"; }
fail()  { echo -e "${RED}[fail]${NC} $1"; exit 1; }

# ── Pre-flight checks ─────────────────────────
info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || fail "Docker is required. Install: curl -fsSL https://get.docker.com | bash"
command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v curl >/dev/null 2>&1 || fail "curl is required."

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 20 ] || fail "Node.js 20+ required (found v$(node -v))"

# Check Docker is running
docker info >/dev/null 2>&1 || fail "Docker daemon not running. Start with: systemctl start docker"

ok "All prerequisites met"

# ── Configuration ─────────────────────────────
if [ -z "$OPENCODE_API_KEY" ]; then
  echo ""
  info "OpenCode API key required (for OpenClaw agents)"
  info "Get one at: https://opencode.ai"
  read -r -p "  API key: " OPENCODE_API_KEY
  OPENCODE_API_KEY="${OPENCODE_API_KEY:-}"
  if [ -z "$OPENCODE_API_KEY" ]; then
    fail "API key is required"
  fi
fi

# ── Create directories ────────────────────────
info "Creating directory structure..."
mkdir -p "${IMAGES_DIR}"
mkdir -p "${USERS_DIR}/nightdev/workspace"
mkdir -p "${USERS_DIR}/nightdev/workspace-builder"
mkdir -p "${USERS_DIR}/nightdev/workspace-tester"
mkdir -p "${USERS_DIR}/nightdev/workspace-committer"
ok "Directories created"

# ── Write infrastructure files ────────────────

info "Writing Dockerfile..."
cat > "${IMAGES_DIR}/Dockerfile" << 'DOCKERFILE'
FROM node:24
RUN npm install -g openclaw@latest && npm install -g pm2
RUN mkdir -p /root/.openclaw
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY bridge.js /root/bridge.js
EXPOSE 18789 18790
ENTRYPOINT ["/entrypoint.sh"]
DOCKERFILE
ok "Dockerfile written"

info "Writing entrypoint.sh..."
cat > "${IMAGES_DIR}/entrypoint.sh" << 'ENTRYPOINT'
#!/bin/bash
set -e

echo "[container] Starting OpenClaw gateway..."
openclaw gateway --port 18789 &
GATEWAY_PID=$!

echo "[container] Waiting for gateway..."
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:18789/health > /dev/null 2>&1; then
    echo "[container] Gateway ready"
    break
  fi
  sleep 1
done

echo "[container] Starting bridge with PM2..."
exec pm2-runtime /root/bridge.js
ENTRYPOINT
chmod +x "${IMAGES_DIR}/entrypoint.sh"
ok "entrypoint.sh written"

info "Writing container bridge.js..."
cat > "${IMAGES_DIR}/bridge.js" << 'BRIDGEJS'
const http = require("http")
const path = require("path")
const fs = require("fs")
const crypto = require("node:crypto")

const OPENCLAW_DIST = "/usr/local/lib/node_modules/openclaw/dist"
let GatewayClient

function discoverGatewayClient() {
  if (!fs.existsSync(OPENCLAW_DIST)) {
    const alt = "/usr/lib/node_modules/openclaw/dist"
    if (fs.existsSync(alt)) {
      const files = fs.readdirSync(alt)
      for (const f of files) {
        if (f.startsWith("client-") && f.endsWith(".js")) {
          try {
            const mod = require(path.join(alt, f))
            if (mod.GatewayClient) return mod.GatewayClient
            if (mod.n && mod.n.prototype && mod.n.prototype.request) return mod.n
          } catch (e) {}
        }
      }
    }
    throw new Error("GatewayClient not found in OpenClaw dist")
  }
  const files = fs.readdirSync(OPENCLAW_DIST)
  for (const f of files) {
    if (f.startsWith("client-") && f.endsWith(".js")) {
      try {
        const mod = require(path.join(OPENCLAW_DIST, f))
        if (mod.GatewayClient) return mod.GatewayClient
        if (mod.n && mod.n.prototype && mod.n.prototype.request) return mod.n
      } catch (e) {}
    }
  }
  throw new Error("GatewayClient not found in OpenClaw dist")
}

GatewayClient = discoverGatewayClient()

const GATEWAY_URL = process.env.GATEWAY_URL || "ws://127.0.0.1:18789"
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "18790", 10)
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN

if (!GATEWAY_TOKEN) {
  console.error("[bridge] GATEWAY_TOKEN required")
  process.exit(1)
}
if (!BRIDGE_TOKEN) {
  console.error("[bridge] BRIDGE_TOKEN required")
  process.exit(1)
}

const CONVERSATION_KEYWORDS = [
  "hola", "hello", "hi", "hey", "buenas", "que tal", "como estas",
  "buenos dias", "buenas tardes", "buenas noches", "saludos",
  "good morning", "good afternoon", "good evening",
  "quien eres", "who are you", "que eres", "what are you",
  "que sabes hacer", "what can you do", "que haces",
  "gracias", "thanks", "thank you", "adios", "bye", "nos vemos",
  "bien y tu",
]
const BUILD_KEYWORDS = [
  "crea", "crear", "build", "make", "create", "generate",
  "escribe", "write", "haz", "hazme", "desarrolla", "develop",
  "implementa", "implement", "script", "api", "app",
  "programa", "program", "codigo", "code",
]

function isConversation(msg) {
  const lower = msg.toLowerCase().trim()
  if (lower.length < 30) {
    return !BUILD_KEYWORDS.some(k => lower.startsWith(k) || lower.startsWith(k + " "))
  }
  return CONVERSATION_KEYWORDS.some(k => lower.includes(k))
}

async function callAgent(agentId, message, timeoutMs = 120000) {
  const client = new GatewayClient({
    url: GATEWAY_URL,
    token: GATEWAY_TOKEN,
    role: "operator",
    scopes: ["operator.write"],
    clientName: "cli",
    clientVersion: "2026.6.8",
    mode: "cli",
    platform: process.platform,
  })
  client.start()
  await new Promise(resolve => setTimeout(resolve, 2000))
  try {
    const result = await client.request("agent", {
      message,
      agentId,
      idempotencyKey: crypto.randomUUID()
    }, { expectFinal: true, timeoutMs })
    return result?.result?.payloads?.[0]?.text || ""
  } finally {
    client.stop()
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405)
    res.end(JSON.stringify({ error: "Method not allowed" }))
    return
  }
  const auth = req.headers["authorization"]
  if (auth !== "Bearer " + BRIDGE_TOKEN) {
    res.writeHead(401)
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return
  }
  let body = ""
  req.on("data", chunk => body += chunk)
  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body)
      const message = parsed.message
      if (!message) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: "message is required" }))
        return
      }
      const start = Date.now()
      console.log("[bridge] Message:", message.slice(0, 50))
      if (isConversation(message)) {
        const text = await callAgent("main", message, 30000)
        const duration = Date.now() - start
        console.log("[bridge] Responded in", duration + "ms")
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true, text, duration }))
        return
      }
      console.log("[bridge] Sending to builder...")
      const buildResult = await callAgent("builder", message, 180000)
      console.log("[bridge] Builder done")
      console.log("[bridge] Sending to tester...")
      const testResult = await callAgent("tester",
        "Review this build result and verify it works:\n\n" + buildResult,
        180000
      )
      console.log("[bridge] Tester done")
      const duration = Date.now() - start
      const text = "**Resultado:**\n\n" + buildResult +
        "\n\n**Verificacion:**\n\n" + testResult
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, text, duration }))
    } catch (err) {
      console.error("[error]", err.message)
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })
})

server.listen(BRIDGE_PORT, "0.0.0.0", () => {
  console.log("[bridge] Listening on port", BRIDGE_PORT)
})
BRIDGEJS
ok "bridge.js written"

info "Writing master bridge (provision.js)..."
cat > "${NIGHTDEV_DIR}/provision.js" << 'PROVISION'
const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("node:crypto")
const { execSync } = require("node:child_process")

const USERS_DIR = "/opt/nightdev/users"
const COMPOSE_DIR = "/opt/nightdev"
const TEMPLATE_USER = "nightdev"
const BRIDGE_PORT = 18790
const BRIDGE_TOKEN = "nightdev-bridge-2026"
const USERS_FILE = "/opt/nightdev/users.json"

let userRegistry = {}
if (fs.existsSync(USERS_FILE)) {
  userRegistry = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
}
if (!userRegistry["nightdev"]) {
  userRegistry["nightdev"] = { slug: "nightdev", port: 18791, bridgeToken: "nightdev-bridge-2026" }
}

function saveRegistry() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(userRegistry, null, 2))
}

function getNextPort() {
  const used = Object.values(userRegistry).map(e => e.port).filter(Boolean)
  let port = 18792
  while (used.includes(port)) port++
  return port
}

function provisionUser(userId, username) {
  if (userRegistry[userId]) {
    return { ok: true, existing: true, ...userRegistry[userId] }
  }
  const slug = "u" + userId.replace(/[^a-zA-Z0-9]/g, "")
  const port = getNextPort()
  const bridgeToken = "bridge_" + crypto.randomBytes(16).toString("hex")
  const gatewayToken = "nd_" + crypto.randomBytes(32).toString("hex")
  const userDir = path.join(USERS_DIR, slug)

  execSync("mkdir -p " + userDir + "/workspace " + userDir + "/workspace-builder " + userDir + "/workspace-tester " + userDir + "/workspace-committer")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace/AGENTS.md " + userDir + "/workspace/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace/SOUL.md " + userDir + "/workspace/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace-builder/AGENTS.md " + userDir + "/workspace-builder/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace-builder/SOUL.md " + userDir + "/workspace-builder/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace-tester/AGENTS.md " + userDir + "/workspace-tester/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/workspace-tester/SOUL.md " + userDir + "/workspace-tester/")
  execSync("cp " + USERS_DIR + "/" + TEMPLATE_USER + "/.env " + userDir + "/.env")

  const config = {
    gateway: {
      mode: "local",
      auth: { mode: "token", token: gatewayToken },
      bind: "loopback",
      port: 18789
    },
    agents: {
      defaults: { model: { primary: "opencode-go/deepseek-v4-flash" } },
      list: [
        { id: "main" },
        { id: "builder", workspace: "/root/.openclaw/workspace-builder", identity: { name: "Builder", emoji: "\ud83d\udd28" } },
        { id: "tester", workspace: "/root/.openclaw/workspace-tester", identity: { name: "Tester", emoji: "\ud83e\uddea" } },
        { id: "committer", workspace: "/root/.openclaw/workspace-committer", identity: { name: "Committer", emoji: "\ud83d\udce6" } }
      ]
    }
  }
  fs.writeFileSync(path.join(userDir, "openclaw.json"), JSON.stringify(config, null, 2))

  const composeEntry = [
    "  " + slug + ":",
    "    build:",
    "      context: ./images/base",
    "    container_name: nd-" + slug,
    "    ports:",
    '      - "' + port + ':18790"',
    "    environment:",
    "      - GATEWAY_TOKEN=" + gatewayToken,
    "      - BRIDGE_TOKEN=" + bridgeToken,
    "      - BRIDGE_PORT=18790",
    "    volumes:",
    "      - " + userDir + "/openclaw.json:/root/.openclaw/openclaw.json",
    "      - " + userDir + "/.env:/root/.openclaw/.env",
    "      - " + userDir + "/workspace:/root/.openclaw/workspace",
    "      - " + userDir + "/workspace-builder:/root/.openclaw/workspace-builder",
    "      - " + userDir + "/workspace-tester:/root/.openclaw/workspace-tester",
    "      - " + userDir + "/workspace-committer:/root/.openclaw/workspace-committer",
    "    restart: unless-stopped"
  ].join("\n")

  fs.appendFileSync(path.join(COMPOSE_DIR, "docker-compose.yml"), "\n" + composeEntry)

  try {
    execSync("docker compose -f " + COMPOSE_DIR + "/docker-compose.yml up -d " + slug + " 2>&1", { timeout: 120000 })
  } catch (e) {
    return { ok: false, error: "Failed to start container: " + e.message }
  }

  const entry = { slug, port, bridgeToken }
  userRegistry[userId] = entry
  saveRegistry()
  return { ok: true, existing: false, ...entry }
}

// On startup, verify all known user containers are running
function verifyContainers() {
  let healthy = 0, unhealthy = 0
  for (const [userId, entry] of Object.entries(userRegistry)) {
    try {
      const result = execSync("docker ps --filter name=nd-" + entry.slug + " --format '{{.Status}}' 2>/dev/null", { timeout: 5000 }).toString().trim()
      if (result.length > 0) {
        healthy++
      } else {
        unhealthy++
        console.log("[bridge] Starting missing container for " + entry.slug)
        execSync("docker compose -f " + COMPOSE_DIR + "/docker-compose.yml up -d " + entry.slug + " 2>&1", { timeout: 120000 })
        healthy++
      }
    } catch {
      try {
        execSync("docker compose -f " + COMPOSE_DIR + "/docker-compose.yml up -d " + entry.slug + " 2>&1", { timeout: 120000 })
        healthy++
      } catch (e) {
        unhealthy++
        console.log("[bridge] Failed to start container for " + entry.slug + ": " + e.message)
      }
    }
  }
  return { healthy, unhealthy }
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers["authorization"]
  if (auth !== "Bearer " + BRIDGE_TOKEN) {
    res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" })); return
  }
  let body = ""
  req.on("data", chunk => body += chunk)
  req.on("end", async () => {
    try {
      const parsed = JSON.parse(body)
      const userId = parsed.user_id
      const message = parsed.message
      const username = parsed.username || "unknown"
      if (!userId) { res.writeHead(400); res.end(JSON.stringify({ error: "user_id is required" })); return }
      if (!userRegistry[userId]) {
        console.log("[bridge] New user:", userId, username)
        const result = provisionUser(userId, username)
        if (!result.ok) { res.writeHead(500); res.end(JSON.stringify(result)); return }
        console.log("[bridge] Provisioned", result.slug, "on port", result.port)
      }
      const entry = userRegistry[userId]
      if (!message) {
        res.writeHead(200); res.end(JSON.stringify({ ok: true, provisioned: true, slug: entry.slug, port: entry.port })); return
      }
      const forwardBody = JSON.stringify({ message })
      const options = {
        hostname: "127.0.0.1",
        port: entry.port,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + entry.bridgeToken,
          "Content-Length": Buffer.byteLength(forwardBody)
        },
        timeout: 300000
      }
      const proxyReq = http.request(options, (proxyRes) => {
        let data = ""
        proxyRes.on("data", chunk => data += chunk)
        proxyRes.on("end", () => { res.writeHead(proxyRes.statusCode, { "Content-Type": "application/json" }); res.end(data) })
      })
      proxyReq.on("error", (err) => { res.writeHead(502); res.end(JSON.stringify({ ok: false, error: "Container unreachable: " + err.message })) })
      proxyReq.on("timeout", () => { proxyReq.destroy(); res.writeHead(504); res.end(JSON.stringify({ ok: false, error: "Container timeout" })) })
      proxyReq.write(forwardBody); proxyReq.end()
    } catch (err) {
      console.error("[error]", err.message)
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: false, error: err.message }))
    }
  })
})

server.listen(BRIDGE_PORT, "0.0.0.0", () => {
  const { healthy, unhealthy } = verifyContainers()
  console.log("[bridge] Master bridge listening on port", BRIDGE_PORT)
  console.log("[bridge] Users:", Object.keys(userRegistry).length, "| Containers:", healthy, "healthy,", unhealthy, "unhealthy")
})
PROVISION
ok "provision.js written"

# ── Write user workspace files ────────────────

info "Writing workspace files for nightdev user..."

cat > "${USERS_DIR}/nightdev/workspace/AGENTS.md" << 'AGENTSMD'
# AGENTS.md

You are the main conversational agent for Nightdev. Handle greetings, questions, and casual conversation. Be helpful and natural.
AGENTSMD

cat > "${USERS_DIR}/nightdev/workspace/SOUL.md" << 'SOULMD'
# SOUL.md

You are a friendly AI assistant. Chat naturally, answer questions, keep it casual. Respond in the user language.
SOULMD

cat > "${USERS_DIR}/nightdev/workspace-builder/AGENTS.md" << 'BUILDERAGENTS'
# Builder Agent

## Role

You write clean, functional code. Create files in your workspace, test them, and report results.

## Rules
- Write clean code with proper error handling
- Follow language/framework conventions
- Write tests when applicable
- Do NOT make git commits
- Report what was built, what files were created, and whether tests passed
BUILDERAGENTS

cat > "${USERS_DIR}/nightdev/workspace-builder/SOUL.md" << 'BUILDERSOUL'
# Builder SOUL

Focused code builder. Write code, nothing else. Be thorough, report clearly.
BUILDERSOUL

cat > "${USERS_DIR}/nightdev/workspace-tester/AGENTS.md" << 'TESTERAGENTS'
# Tester Agent

## Role

Review code and verify it works. Run tests, check for bugs, report results.

## Rules
- Be thorough
- Actually run the code
- Report PASS or FAIL with details
- Do NOT modify code
- Do NOT make git commits
TESTERAGENTS

cat > "${USERS_DIR}/nightdev/workspace-tester/SOUL.md" << 'TESTERSOUL'
# Tester SOUL

Thorough code reviewer. Test everything, report clearly, never modify code.
TESTERSOUL
ok "Workspace files written"

# ── Generate unique tokens ─────────────────────
GATEWAY_TOKEN="nd_$(openssl rand -hex 32 2>/dev/null || node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
ok "Generated gateway token"

# ── Write .env for nightdev user ──────────────
info "Writing .env for nightdev user..."
cat > "${USERS_DIR}/nightdev/.env" << ENVFILE
OPENCODE_API_KEY=${OPENCODE_API_KEY}
ENVFILE
ok ".env written"

# ── Write docker-compose.yml ──────────────────
info "Writing docker-compose.yml..."
cat > "${COMPOSE_DIR}/docker-compose.yml" << COMPOSEFILE
services:
  nightdev:
    build:
      context: ./images/base
    container_name: nd-nightdev
    ports:
      - "18791:18790"
    environment:
      - GATEWAY_TOKEN=${GATEWAY_TOKEN}
      - BRIDGE_TOKEN=${MASTER_TOKEN}
      - BRIDGE_PORT=18790
    volumes:
      - ./users/nightdev/openclaw.json:/root/.openclaw/openclaw.json
      - ./users/nightdev/.env:/root/.openclaw/.env
      - ./users/nightdev/workspace:/root/.openclaw/workspace
      - ./users/nightdev/workspace-builder:/root/.openclaw/workspace-builder
      - ./users/nightdev/workspace-tester:/root/.openclaw/workspace-tester
      - ./users/nightdev/workspace-committer:/root/.openclaw/workspace-committer
    restart: unless-stopped
COMPOSEFILE
ok "docker-compose.yml written"

# ── Write openclaw.json for nightdev ──────────
info "Writing openclaw.json for nightdev user..."
cat > "${USERS_DIR}/nightdev/openclaw.json" << OPENCLAWJSON
{
  "gateway": {
    "mode": "local",
    "auth": { "mode": "token", "token": "${GATEWAY_TOKEN}" },
    "bind": "loopback",
    "port": 18789
  },
  "agents": {
    "defaults": { "model": { "primary": "opencode-go/deepseek-v4-flash" } },
    "list": [
      { "id": "main" },
      { "id": "builder", "workspace": "/root/.openclaw/workspace-builder", "identity": { "name": "Builder", "emoji": "\ud83d\udd28" } },
      { "id": "tester", "workspace": "/root/.openclaw/workspace-tester", "identity": { "name": "Tester", "emoji": "\ud83e\uddea" } },
      { "id": "committer", "workspace": "/root/.openclaw/workspace-committer", "identity": { "name": "Committer", "emoji": "\ud83d\udce6" } }
    ]
  }
}
OPENCLAWJSON
ok "openclaw.json written"

# ── Write users.json ──────────────────────────
cat > "${NIGHTDEV_DIR}/users.json" << USERSJSON
{"nightdev":{"slug":"nightdev","port":18791,"bridgeToken":"${MASTER_TOKEN}"}}
USERSJSON
ok "users.json written"

# ── Build Docker image ────────────────────────
info "Building Docker base image..."
docker build -t nightdev-base "${IMAGES_DIR}" 2>&1 | while read -r line; do echo "  $line"; done
ok "Docker image built"

# ── Write systemd service ─────────────────────
info "Creating systemd service for master bridge..."
cat > /etc/systemd/system/nightdev-master-bridge.service << 'SYSTEMD'
[Unit]
Description=Nightdev Master Bridge
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
ExecStart=/usr/bin/node /opt/nightdev/provision.js
Restart=always
RestartSec=5
User=root
WorkingDirectory=/opt/nightdev
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SYSTEMD
systemctl daemon-reload
systemctl enable nightdev-master-bridge
ok "Systemd service created"

# ── Start containers ──────────────────────────
info "Starting nightdev container..."
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" up -d nightdev 2>&1
ok "nightdev container started"

info "Starting master bridge..."
systemctl start nightdev-master-bridge
sleep 2
systemctl is-active --quiet nightdev-master-bridge || warn "Master bridge may not have started. Check: systemctl status nightdev-master-bridge"
ok "Master bridge started"

# ── Summary ───────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Nightdev VPS Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  ${CYAN}Master Bridge:${NC}    http://$(curl -4 -s ifconfig.co 2>/dev/null || hostname -I | awk '{print $1}'):${BRIDGE_PORT}"
echo -e "  ${CYAN}Auth Token:${NC}       ${MASTER_TOKEN}"
echo -e "  ${CYAN}First User:${NC}       nightdev (port 18791)"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo "  1. Clone the bot repo on your local machine:"
echo "     git clone git@github.com:hiramgabriel1/nightdev_rep.git"
echo "     cd nightdev"
echo ""
echo "  2. Configure .env with:"
echo "     OPENCLAW_BRIDGE_HOST=<your-vps-ip>"
echo "     OPENCLAW_BRIDGE_PORT=${BRIDGE_PORT}"
echo "     OPENCLAW_BRIDGE_TOKEN=${MASTER_TOKEN}"
echo "     TELEGRAM_BOT_TOKEN=<your-bot-token>"
echo "     DATABASE_URL=<your-db-url>"
echo ""
echo "  3. Run the bot:"
echo "     pnpm install && pnpm prisma generate && pnpm prisma db push && pnpm dev"
echo ""
echo -e "  ${YELLOW}New users are auto-provisioned on first message.${NC}"
echo ""
