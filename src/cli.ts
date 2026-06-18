import inquirer from 'inquirer'
import { render } from 'oh-my-logo'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dirname, '..', '.nightdev-config.json')

interface LocalConfig {
  provider?: string
  providerApiKey?: string
  telegramBotToken?: string
  useOurService: boolean
}

const PROVIDERS = [
  { id: 'openclaw', name: 'OpenClaw', emoji: '🦞', prefix: 'sk-' },
  { id: 'anthropic', name: 'Claude Code (Anthropic)', emoji: '🧠', prefix: 'sk-ant-' },
  { id: 'openai', name: 'OpenAI (GPT)', emoji: '🤖', prefix: 'sk-' },
  { id: 'google', name: 'Google Gemini', emoji: '💎', prefix: 'AIza' },
  { id: 'deepseek', name: 'DeepSeek', emoji: '🐋', prefix: 'sk-' },
  { id: 'mistral', name: 'Mistral', emoji: '🌬️', prefix: '' },
  { id: 'groq', name: 'Groq', emoji: '⚡', prefix: 'gsk_' },
  { id: 'together', name: 'Together AI', emoji: '🤝', prefix: '' },
  { id: 'perplexity', name: 'Perplexity', emoji: '🔍', prefix: 'pplx-' },
  { id: 'xai', name: 'xAI (Grok)', emoji: '', prefix: 'xai-' },
]

function loadConfig(): LocalConfig {
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      return { useOurService: false }
    }
  }
  return { useOurService: false }
}

function saveConfig(config: LocalConfig) {
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

async function showWelcome() {
  console.clear()
  console.log('\n')
  const logo = await render('Nightdev')
  console.log(logo)
  console.log('   Build software from your pocket')
  console.log('\n')
}

function showConfigStatus(config: LocalConfig) {
  console.log(' Configuración actual:')
  console.log('─'.repeat(40))

  if (config.provider && config.providerApiKey) {
    const provider = PROVIDERS.find((p) => p.id === config.provider)
    const masked = config.providerApiKey.slice(0, 4) + '••••' + config.providerApiKey.slice(-4)
    console.log(`   Proveedor: ${provider?.emoji} ${provider?.name || config.provider}`)
    console.log(`   API Key: ${masked}`)
  } else {
    console.log('   Proveedor: No configurado')
    console.log('   API Key: No configurada')
  }

  if (config.telegramBotToken) {
    const masked = config.telegramBotToken.slice(0, 6) + '••••' + config.telegramBotToken.slice(-4)
    console.log(`   Telegram Bot Token: ${masked}`)
  } else {
    console.log('   Telegram Bot Token: No configurado')
  }

  console.log(`   Modo: ${config.useOurService ? 'Nightdev (orquestador)' : 'API key propia'}`)
  console.log('─'.repeat(40))
  console.log()
}

async function mainMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

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

  await configureMenu()
}

async function configureMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

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
    await mainMenu()
    return
  }

  if (action === 'own_key') {
    await providerSelectionMenu()
  } else if (action === 'nightdev') {
    config.useOurService = true
    config.provider = undefined
    config.providerApiKey = undefined
    saveConfig(config)
    console.log('\n✅ ¡Listo! Ahora usarás los recursos y modelos de Nightdev.')
    console.log('   Solo escribe lo que quieres construir y el agente lo hará por ti.\n')
    await telegramSetupStep()
  }
}

async function providerSelectionMenu(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

  const choices = PROVIDERS.map((p) => ({
    name: `${p.emoji} ${p.name}`,
    value: p.id,
  }))

  choices.push({ name: 'Volver al menú anterior', value: 'back' })

  const { provider } = await inquirer.prompt<{ provider: string }>([
    {
      type: 'select',
      name: 'provider',
      message: 'Selecciona tu proveedor de modelos:',
      choices,
    },
  ])

  if (provider === 'back') {
    await configureMenu()
    return
  }

  const selectedProvider = PROVIDERS.find((p) => p.id === provider)

  if (!selectedProvider) {
    console.log('\n❌ Proveedor no válido.\n')
    await providerSelectionMenu()
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

  config.provider = provider
  config.providerApiKey = apiKey
  config.useOurService = false
  saveConfig(config)

  console.log(`\n✅ ${selectedProvider.emoji} ${selectedProvider.name} configurado correctamente.\n`)
  await telegramSetupStep()
}

async function telegramSetupStep(): Promise<void> {
  await showWelcome()

  const config = loadConfig()
  showConfigStatus(config)

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
    config.telegramBotToken = telegramBotToken
    saveConfig(config)
    console.log('\n✅ Telegram Bot Token guardado.')
  } else {
    console.log('\n️  Telegram Bot Token omitido.')
  }

  console.log('\n✅ Configuración completa.\n')
  await pauseAndReturn()
}

async function pauseAndReturn() {
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
    await mainMenu()
  })
}

export async function startCLI() {
  await mainMenu()
}

startCLI()
