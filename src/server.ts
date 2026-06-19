import express, { type Request, type Response, type NextFunction } from 'express'
import { logger } from './core/logger.js'
import { prisma } from './core/db.js'

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

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Express error', err)
  res.status(500).json({ error: 'Internal server error' })
})

export default app
