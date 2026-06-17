import 'dotenv/config'
import TelegramBot from 'node-telegram-bot-api'
import { handleCommands } from './commands.js'
import { handleMessage } from './handlers.js'
import { logger } from './logger.js'

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })

bot.on('message', (msg) => {
  logger.info(`Message from ${msg.from?.username || msg.from?.id}: ${msg.text}`)
  handleMessage(bot, msg)
})

bot.on('error', (err) => logger.error('Bot error', err))

handleCommands(bot)

logger.info('Bot running...')
