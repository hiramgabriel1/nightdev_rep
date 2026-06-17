import TelegramBot from 'node-telegram-bot-api'
import { handleCommands } from './commands.js'
import { handleMessage } from './handlers.js'

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: true })

bot.on('message', (msg) => {
  handleMessage(bot, msg)
})

handleCommands(bot)

console.log('Bot running...')
