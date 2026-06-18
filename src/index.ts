import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleCommands } from './bot/commands.js'
import { handleMessage } from './bot/handlers.js'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'
import { openclaw } from './services/openclaw.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

await prisma.$connect()
logger.info('Database connected')

await openclaw.connect()
logger.info('OpenClaw Gateway connected')

// Sync GitHub repo from local config if pending
const localConfigPath = join(__dirname, '..', '.nightdev-config.json')
if (existsSync(localConfigPath)) {
  try {
    const localConfig = JSON.parse(readFileSync(localConfigPath, 'utf-8'))
    if (localConfig.githubRepo && !localConfig.githubDeployKeyDone) {
      logger.info('Syncing GitHub repo from local config...')
      const users = await prisma.user.findFirst({ where: { useOurService: true } })
      if (users) {
        await openclaw.setRepo(users.telegramId!, localConfig.githubRepo, localConfig.githubBranch || 'main')
        await prisma.user.update({
          where: { id: users.id },
          data: {
            githubRepo: localConfig.githubRepo,
            githubBranch: localConfig.githubBranch || 'main',
          },
        })
        logger.info('GitHub repo synced to bridge and database')
      }
    }
  } catch (err) {
    if (err instanceof Error) logger.warn('Failed to sync local config: ' + err.message)
  }
}

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
