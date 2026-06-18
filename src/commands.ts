import TelegramBot, { Message } from 'node-telegram-bot-api'
import { logger } from './logger.js'
import { prisma } from './db.js'
import { pendingPipelines } from './pipeline.js'
import { openclaw } from './openclaw.js'
import { sanitizeOutput } from './security.js'

async function upsertUser(telegramId: string, msg: Message) {
  const from = msg.from
  await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
    create: {
      telegramId,
      username: from?.username ?? undefined,
      firstName: from?.first_name ?? undefined,
      lastName: from?.last_name ?? undefined,
      languageCode: from?.language_code ?? undefined,
    },
  })
}

export function handleCommands(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const telegramId = String(msg.from?.id ?? 'unknown')
    const username = msg.from?.username
    logger.info(`/start from ${username ?? telegramId}`)

    await upsertUser(telegramId, msg)

    bot.sendMessage(
      msg.chat.id,
      'Bienvenido a Nightdev.\n\n' +
      'Dime qué quieres construir y yo me encargo. Por ejemplo:\n\n' +
      '• "Crea una API REST con Express"\n' +
      '• "Hazme una landing page en React"\n' +
      '• "Crea un script en Python que scrapeé una web"\n\n' +
      'Usa /status para ver tu configuración actual.',
    )
  })

  bot.onText(/\/status/, async (msg) => {
    const telegramId = String(msg.from?.id)
    const user = await prisma.user.findUnique({ where: { telegramId } })

    if (!user) {
      bot.sendMessage(msg.chat.id, 'No tienes configuración. Envía /start para comenzar.')
      return
    }

    let status = '📋 Tu configuración actual:\n\n'

    if (user.useOurService) {
      status += '🟢 Modo: Nightdev (orquestador)\n'
    } else if (user.provider) {
      status += `🔑 Modo: API key propia (${user.provider})\n`
    } else {
      status += '⚠️ Modo: No configurado\n'
    }

    if (user.tgApiKey) {
      const masked = user.tgApiKey.slice(0, 6) + '••••' + user.tgApiKey.slice(-4)
      status += `🤖 Bot Token: ${masked}\n`
    }

    status += `\nUsa /help para más información.`

    bot.sendMessage(msg.chat.id, status)
  })

  bot.on('callback_query', async (query) => {
    if (!query.data || (!query.data.startsWith('approve:') && !query.data.startsWith('reject:'))) {
      return
    }

    const telegramId = String(query.from?.id)
    const user = query.from?.username ?? query.from?.id
    logger.info(`Callback: ${query.data} from ${user}`)

    const [action, pipelineId] = query.data.split(':')
    const pipeline = pendingPipelines.get(pipelineId)

    if (!pipeline) {
      bot.answerCallbackQuery(query.id, { text: 'Pipeline expirado.' })
      return
    }

    bot.answerCallbackQuery(query.id)

    if (action === 'approve') {
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message?.chat.id!,
        message_id: query.message?.message_id!,
      })

      const commitMsg = await bot.sendMessage(pipeline.chatId, '📦 Committer generando commit...')

      try {
        const commitResult = sanitizeOutput(await openclaw.sendMessage(
          `Create a git commit for the following code. Provide the commit message and summary of changes.\n\nRequirements: ${pipeline.message}\n\nCode:\n${pipeline.result.buildOutput}`,
          'committer',
        ))
        bot.deleteMessage(pipeline.chatId, commitMsg.message_id).catch(() => {})
        bot.sendMessage(pipeline.chatId, `✅ Commit creado:\n\n\`\`\`\n${commitResult}\n\`\`\``, {
          parse_mode: 'Markdown',
        })
      } catch (err) {
        bot.deleteMessage(pipeline.chatId, commitMsg.message_id).catch(() => {})
        logger.error('Committer failed', err)
        bot.sendMessage(pipeline.chatId, '❌ Error al crear el commit. Intenta de nuevo.')
      }
    } else {
      pendingPipelines.delete(pipelineId)
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message?.chat.id!,
        message_id: query.message?.message_id!,
      })
      bot.sendMessage(pipeline.chatId, '❌ Pipeline rechazado. Envía otro requerimiento para intentar de nuevo.')
    }

    pendingPipelines.delete(pipelineId)
  })

  bot.onText(/\/help/, (msg) => {
    const user = msg.from?.username ?? msg.from?.id ?? 'unknown'
    logger.info(`/help from ${user}`)
    bot.sendMessage(
      msg.chat.id,
      'Comandos disponibles:\n\n' +
      '/start — Iniciar y ver bienvenida\n' +
      '/status — Ver tu configuración actual\n' +
      '/help — Mostrar esta ayuda',
    )
  })
}
