import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { handleCommands } from './bot/commands.js'
import { handleMessage } from './bot/handlers.js'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'
import { openclaw } from './services/openclaw.js'

await prisma.$connect()
logger.info('Database connected')

await openclaw.connect()
logger.info('OpenClaw Gateway connected')

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
  polling: {
    params: { timeout: 30 },
  },
})

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

logger.info('Bot running...')

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit()
})
