import express, { type Request, type Response, type NextFunction } from 'express'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'
import webhookRouter, { registerBotToken } from './webhook.js'

const app = express()

app.use(express.json())

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Powered-By', 'Nightdev')
  next()
})

app.get('/health', async (_req: Request, res: Response) => {
  const userCount = await prisma.user.count()
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    users: userCount,
  })
})

app.get('/admin/user/:telegramId', async (req: Request, res: Response) => {
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const telegramId = req.params.telegramId as string
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const { providerApiKey, tgApiKey, opencodeApiKey, ...safe } = user
  res.json(safe)
})

app.post('/api/v1/register', async (req: Request, res: Response) => {
  const { botToken, webhookUrl } = req.body as { botToken?: string; webhookUrl?: string }

  if (!botToken) {
    res.status(400).json({ ok: false, error: 'botToken is required' })
    return
  }

  const baseUrl = webhookUrl || process.env.WEBHOOK_PUBLIC_URL
  if (!baseUrl) {
    res.status(400).json({ ok: false, error: 'webhookUrl is required (or set WEBHOOK_PUBLIC_URL env var)' })
    return
  }

  const result = await registerBotToken(botToken, baseUrl)
  res.status(result.ok ? 200 : 400).json(result)
})

app.post('/api/v1/unregister', async (req: Request, res: Response) => {
  const { botToken } = req.body as { botToken?: string }

  if (!botToken) {
    res.status(400).json({ ok: false, error: 'botToken is required' })
    return
  }

  await prisma.user.deleteMany({ where: { botToken } })
  res.json({ ok: true })
})

app.get('/api/v1/status', async (req: Request, res: Response) => {
  const botToken = req.query.botToken as string | undefined

  if (!botToken) {
    res.status(400).json({ ok: false, error: 'botToken query param is required' })
    return
  }

  const user = await prisma.user.findUnique({ where: { botToken } })
  if (!user) {
    res.status(404).json({ ok: false, error: 'Bot not registered' })
    return
  }

  const { providerApiKey, tgApiKey, opencodeApiKey, githubToken, ...safe } = user
  res.json({ ok: true, user: safe })
})

app.use(webhookRouter)

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Express error', err)
  res.status(500).json({ error: 'Internal server error' })
})

export default app
