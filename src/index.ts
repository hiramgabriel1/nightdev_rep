import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { handleCommands } from './bot/commands.js'
import { handleMessage } from './bot/handlers.js'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'
import { openclaw } from './services/openclaw.js'
import app from './server.js'

const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10)
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || ''

await prisma.$connect()
logger.info('Database connected')

await openclaw.connect()
logger.info('OpenClaw Gateway connected')

// Sync GitHub repos from database to bridge (for users who configured via CLI)
try {
  const usersWithRepo = await prisma.user.findMany({
    where: { githubRepo: { not: null }, githubDeployKeyDone: false },
  })
  for (const user of usersWithRepo) {
    if (!user.telegramId) continue
    logger.info(`Syncing GitHub repo for user ${user.telegramId}...`)
    await openclaw.setRepo(user.telegramId, user.githubRepo!, user.githubBranch ?? 'main')
  }
  if (usersWithRepo.length > 0) logger.info(`Synced ${usersWithRepo.length} GitHub repo(s) to bridge`)
} catch (err) {
  if (err instanceof Error) logger.warn('GitHub sync failed: ' + err.message)
}

const token = process.env.TELEGRAM_BOT_TOKEN!
const bot = WEBHOOK_URL
  ? new TelegramBot(token, { polling: false, webHook: { port: HTTP_PORT } })
  : new TelegramBot(token, {
      polling: { params: { timeout: 30 } },
    })

if (WEBHOOK_URL) {
  bot.setWebHook(`${WEBHOOK_URL}/bot${token}`)
  app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body)
    res.sendStatus(200)
  })
  logger.info(`Webhook set at ${WEBHOOK_URL}/bot${token}`)
}

bot.on('message', async (msg) => {
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
  logger.info(`Message from ${user}: ${msg.text}`)
  handleMessage(bot, msg)
})

bot.on('polling_error', (err) => {
  if (err.message?.includes('fetch failed')) {
    logger.warn(`Telegram polling error (auto-recovering): ${err.message}`)
  } else {
    logger.error('Telegram polling error', err.message)
  }
})

bot.on('error', (err) => logger.error('Bot error', err))

handleCommands(bot)

app.listen(HTTP_PORT, () => {
  logger.info(`HTTP server on port ${HTTP_PORT}`)
  logger.info(`Bot running (${WEBHOOK_URL ? 'webhook' : 'polling'})...`)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit()
})
