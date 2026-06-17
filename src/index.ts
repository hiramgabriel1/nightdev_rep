import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { handleCommands } from './commands.js'
import { handleMessage } from './handlers.js'
import { logger } from './logger.js'

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })

bot.on('message', (msg) => {
  const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
  logger.info(`Message from ${user}: ${msg.text}`)
  handleMessage(bot, msg)
})

bot.on('error', (err) => logger.error('Bot error', err))

handleCommands(bot)

logger.info('Bot running...')
