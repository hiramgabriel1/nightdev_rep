# Nightdev

Telegram bot que te permite programar desde tu celular usando agentes de IA.

## Qué hace

Nightdev ofrece dos modos de uso:

- **Orquestador propio** — Envías un mensaje describiendo lo que quieres construir y el bot lo ejecuta en un VPS remoto a través de SSH usando [OpenClaw](https://openclaw.dev) como agente de IA.
- **Bot propio** — Conectas tu propia API key de OpenClaw y tu token de Telegram Bot para crear tu propio bot personalizado gestionado por Nightdev.

## Arquitectura

```
Telegram → Nightdev Bot → OpenClaw (SSH a VPS) → Respuesta
```

- **Telegram Bot** — `node-telegram-bot-api` con polling
- **IA** — OpenClaw Gateway ejecutado vía SSH en un VPS
- **Base de datos** — PostgreSQL con Prisma ORM
- **Rate limiter** — `rate-limiter-flexible` (10 msg/min por usuario)

## Requisitos

- Node.js 22+
- PostgreSQL
- `.env` con las variables necesarias (ver `.env.example`)
- Llave SSH en `.ssh_key` para conectar al VPS de OpenClaw

## Instalación

```bash
pnpm install
cp .env.example .env
# Configura tus variables en .env
pnpm build
```

## Uso

```bash
pnpm dev    # Desarrollo con auto-reload
pnpm start  # Producción
```

## Estructura

| Archivo | Descripción |
|---|---|
| `src/index.ts` | Entrypoint, inicializa bot, DB y OpenClaw |
| `src/commands.ts` | Handlers de `/start`, `/help` y callbacks |
| `src/handlers.ts` | Lógica principal de mensajes y rate limiting |
| `src/openclaw.ts` | Servicio SSH para ejecutar OpenClaw en VPS |
| `src/db.ts` | Cliente Prisma |
| `src/logger.ts` | Logger tipado con niveles |
| `prisma/schema.prisma` | Modelo de usuario |
