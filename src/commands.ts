import TelegramBot from 'node-telegram-bot-api'

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome! Use /help to see available commands.')
  })

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Available commands:\n/start - Start the bot\n/help - Show this message')
  })
}
