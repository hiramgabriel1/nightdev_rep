import TelegramBot from 'node-telegram-bot-api'
import { openclaw } from './openclaw.js'
import { logger } from '../core/logger.js'
import { sanitizeInput, sanitizeOutput } from './security.js'

const MAX_RETRIES = 3

export interface PipelineResult {
  buildOutput: string
  testOutput: string
  testPassed: boolean
  retries: number
}

export interface PendingPipeline {
  chatId: number
  telegramId: string
  result: PipelineResult
  message: string
}

export const pendingPipelines = new Map<string, PendingPipeline>()

export async function runPipeline(
  bot: TelegramBot,
  chatId: number,
  telegramId: string,
  message: string,
): Promise<void> {
  const inputCheck = sanitizeInput(message)
  if (!inputCheck.safe) {
    logger.warn(`Prompt injection detected from ${telegramId}: ${inputCheck.reason}`)
    bot.sendMessage(chatId, '⛔ Mensaje rechazado por seguridad.')
    return
  }

  const statusMsg = await bot.sendMessage(chatId, '🔨 Builder está trabajando...')

  let buildOutput = ''
  let testOutput = ''
  let testPassed = false
  let retries = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      retries = attempt
      await bot.editMessageText(`🔨 Builder reintentando (intento ${attempt}/${MAX_RETRIES})...`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      })
    }

    try {
      buildOutput = sanitizeOutput(await openclaw.sendMessage(
        attempt === 0 ? message : `Fix the previous issues and regenerate. Previous output:\n\n${testOutput}`,
        'builder',
      ))
    } catch (err) {
      logger.error('Builder failed', err)
      bot.editMessageText('❌ Error en el builder. Intenta de nuevo más tarde.', {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      })
      return
    }

    await bot.editMessageText('🧪 Tester verificando el código...', {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    })

    try {
      testOutput = sanitizeOutput(await openclaw.sendMessage(
        `Review this code and verify it meets the requirements. Report PASS or FAIL with specific issues.\n\nRequirements: ${message}\n\nCode:\n${buildOutput}`,
        'tester',
      ))
    } catch (err) {
      logger.error('Tester failed', err)
      bot.editMessageText('❌ Error en el tester. Intenta de nuevo más tarde.', {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      })
      return
    }

    testPassed = testOutput.toUpperCase().includes('PASS')

    if (testPassed) {
      break
    }
  }

  const pipelineId = `${telegramId}_${Date.now()}`
  pendingPipelines.set(pipelineId, {
    chatId,
    telegramId,
    result: { buildOutput, testOutput, testPassed, retries },
    message,
  })

  await bot.deleteMessage(chatId, statusMsg.message_id)

  const report = buildReport(message, buildOutput, testOutput, testPassed, retries)

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✅ Aprobar y commitear', callback_data: `approve:${pipelineId}` },
        { text: '❌ Rechazar', callback_data: `reject:${pipelineId}` },
      ],
    ],
  }

  bot.sendMessage(chatId, report, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
}

function buildReport(
  message: string,
  buildOutput: string,
  testOutput: string,
  testPassed: boolean,
  retries: number,
): string {
  const status = testPassed ? '✅ PASÓ' : '⚠️ NO PASÓ (pero se generó)'
  const retryInfo = retries > 0 ? `\n🔄 Reintentos: ${retries}` : ''

  return `## Pipeline Completado\n\n` +
    `**Requerimiento:** ${message}\n\n` +
    `**Estado del tester:** ${status}${retryInfo}\n\n` +
    `**Output del builder:**\n\`\`\`\n${truncate(buildOutput, 1000)}\n\`\`\`\n\n` +
    `**Reporte del tester:**\n\`\`\`\n${truncate(testOutput, 500)}\n\`\`\``
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}
