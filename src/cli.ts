import inquirer from 'inquirer'
import { render } from 'oh-my-logo'
import { prisma } from './db.js'
import { logger } from './logger.js'

const PROVIDERS = [
  { id: 'openclaw', name: 'OpenClaw', emoji: '🦞', prefix: 'sk-' },
  { id: 'anthropic', name: 'Claude Code (Anthropic)', emoji: '', prefix: 'sk-ant-' },
  { id: 'openai', name: 'OpenAI (GPT)', emoji: '🤖', prefix: 'sk-' },
  { id: 'google', name: 'Google Gemini', emoji: '💎', prefix: 'AIza' },
  { id: 'deepseek', name: 'DeepSeek', emoji: '🐋', prefix: 'sk-' },
  { id: 'mistral', name: 'Mistral', emoji: '🌬️', prefix: '' },
  { id: 'groq', name: 'Groq', emoji: '', prefix: 'gsk_' },
  { id: 'together', name: 'Together AI', emoji: '🤝', prefix: '' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔍', prefix: 'pplx-' },
  { id: 'xai', name: 'xAI (Grok)', emoji: '', prefix: 'xai-' },
]

async function showWelcome() {
  console.clear()
  console.log('\n')
  const logo = await render('Nightdev')
  console.log(logo)
  console.log('   Build software from your pocket')
  console.log('\n')
}

async function identifyUser(): Promise<string> {
  const { username } = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'Ingresa tu @username de Telegram:',
      validate: (input: string) => {
        const cleaned = input.replace(/^@/, '').trim()
        if (cleaned.length < 3) return 'El username debe tener al menos 3 caracteres'
        return true
      },
    },
  ])

  return username.replace(/^@/, '').trim()
}

async function getUser(username: string) {
  return await prisma.user.upsert({
    where: { username },
    update: {},
    create: { username },
  })
}

function showConfigStatus(user: any) {
  console.log(' Configuración actual:')
  console.log('─'.repeat(40))

  if (user.provider && user.providerApiKey) {
    const provider = PROVIDERS.find((p) => p.id === user.provider)
    const masked = user.providerApiKey.slice(0, 4) + '••••' + user.providerApiKey.slice(-4)
    console.log(`   Proveedor: ${provider?.emoji} ${provider?.name || user.provider}`)
    console.log(`   API Key: ${masked}`)
  } else if (user.opencodeApiKey) {
    const masked = user.opencodeApiKey.slice(0, 4) + '••••' + user.opencodeApiKey.slice(-4)
    console.log(`   Proveedor: OpenClaw (legacy)`)
    console.log(`   API Key: ${masked}`)
  } else {
    console.log('   Proveedor: No configurado')
    console.log('   API Key: No configurada')
  }

  if (user.tgApiKey) {
    const masked = user.tgApiKey.slice(0, 6) + '••••' + user.tgApiKey.slice(-4)
    console.log(`   Telegram Bot Token: ${masked}`)
  } else {
    console.log('   Telegram Bot Token: No configurado')
  }

  console.log(`   Modo: ${user.useOurService ? 'Nightdev (orquestador)' : 'API key propia'}`)
  console.log('─'.repeat(40))
  console.log()
}

async function mainMenu(username: string): Promise<void> {
  await showWelcome()

  const user = await getUser(username)
  showConfigStatus(user)

  type MainMenuAction = 'configure' | 'exit'

  const { action } = await inquirer.prompt<{ action: MainMenuAction }>([
    {
      type: 'select',
      name: 'action',
      message: '¿Qué deseas hacer?',
      choices: [
        { name: 'Configurar uso', value: 'configure' },
        { name: 'Salir', value: 'exit' },
      ],
    },
  ])

  if (action === 'exit') {
    console.log('\n ¡Hasta luego!\n')
    return
  }

  await configureMenu(username)
}

async function configureMenu(username: string): Promise<void> {
  await showWelcome()

  const user = await getUser(username)
  showConfigStatus(user)

  type ConfigureAction = 'own_key' | 'nightdev' | 'back'

  const { action } = await inquirer.prompt<{ action: ConfigureAction }>([
    {
      type: 'select',
      name: 'action',
      message: 'Configurar uso:',
      choices: [
        { name: 'Usar mi API key propia para mis modelos', value: 'own_key' },
        { name: 'Usar recursos y modelos de Nightdev', value: 'nightdev' },
        { name: 'Volver al menú anterior', value: 'back' },
      ],
    },
  ])

  if (action === 'back') {
    await mainMenu(username)
    return
  }

  if (action === 'own_key') {
    await providerSelectionMenu(username)
  } else if (action === 'nightdev') {
    await prisma.user.update({
      where: { username },
      data: { useOurService: true, provider: null, providerApiKey: null },
    })
    console.log('\n✅ ¡Listo! Ahora usarás los recursos y modelos de Nightdev.')
    console.log('   Solo escribe lo que quieres construir y el agente lo hará por ti.\n')
    await telegramSetupStep(username)
  }
}

async function providerSelectionMenu(username: string): Promise<void> {
  await showWelcome()

  const user = await getUser(username)
  showConfigStatus(user)

  const choices = PROVIDERS.map((p) => ({
    name: `${p.emoji} ${p.name}`,
    value: p.id,
  }))

  choices.push({ name: '️  Volver al menú anterior', value: 'back' })

  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      type: 'select',
      name: 'provider',
      message: 'Selecciona tu proveedor de modelos:',
      choices,
    },
  ])

  if (provider === 'back') {
    await configureMenu(username)
    return
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)

  if (!selectedProvider) {
    console.log('\n❌ Proveedor no válido.\n')
    await providerSelectionMenu(username)
    return
  }

  const hint = selectedProvider.prefix
    ? ` (comienza con "${selectedProvider.prefix}")`
    : ''

  const { apiKey } = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: `Ingresa tu API key de ${selectedProvider.name}${hint}:`,
      validate: (input: string) => {
        if (input.length < 10) return 'La API key debe tener al menos 10 caracteres'
        if (selectedProvider.prefix && !input.startsWith(selectedProvider.prefix)) {
          return `La API key de ${selectedProvider.name} debe comenzar con "${selectedProvider.prefix}"`
        }
        return true
      },
    },
  ])

  await prisma.user.update({
    where: { username },
    data: {
      provider,
      providerApiKey: apiKey,
      useOurService: false,
      opencodeApiKey: null,
    },
  })

  console.log(`\n✅ ${selectedProvider.emoji} ${selectedProvider.name} configurado correctamente.\n`)
  await telegramSetupStep(username)
}

async function telegramSetupStep(username: string): Promise<void> {
  await showWelcome()

  const user = await getUser(username)
  showConfigStatus(user)

  console.log(' Paso final: Conecta tu bot de Telegram\n')

  const { telegramBotToken } = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: 'Ingresa tu Telegram Bot Token (de @BotFather):',
      validate: (input: string) => {
        if (input.trim() === '') return true
        const regex = /^\d{5,16}:[a-zA-Z0-9_-]{34}$/
        if (!regex.test(input)) return 'Formato inválido. Debe ser como: 123456:ABC-DEF...'
        return true
      },
    },
  ])

  if (telegramBotToken.trim() !== '') {
    await prisma.user.update({
      where: { username },
      data: { tgApiKey: telegramBotToken },
    })
    console.log('\n✅ Telegram Bot Token guardado.')
  } else {
    console.log('\n️  Telegram Bot Token omitido.')
  }

  console.log('\n✅ Configuración completa.\n')
  await pauseAndReturn(username)
}

async function pauseAndReturn(username: string) {
  await inquirer.prompt([
    {
      type: 'select',
      name: 'continue',
      message: '¿Qué deseas hacer?',
      choices: [
        { name: 'Volver al menú principal', value: 'back' },
        { name: 'Salir', value: 'exit' },
      ],
    },
  ]).then(async ({ continue: choice }) => {
    if (choice === 'exit') {
      console.log('\n👋 ¡Hasta luego!\n')
      process.exit(0)
    }
    await mainMenu(username)
  })
}

export async function startCLI() {
  await prisma.$connect()
  logger.info('Database connected')

  await showWelcome()

  const username = await identifyUser()
  await getUser(username)

  console.log(`\n✅ Usuario @${username} encontrado/creado.\n`)

  await mainMenu(username)

  await prisma.$disconnect()
}

startCLI()
