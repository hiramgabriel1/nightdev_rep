import { logger } from '../core/logger.js'
import { prisma } from '../core/db.js'

const INITIAL_TOKENS = 100000
const BURN_THRESHOLD = 0.5
const BURN_WINDOW_MS = 10 * 60 * 1000

export async function checkAbusiveTokenUsage(telegramId: string, currentFreeTokens: number, requestTokens: number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user || !user.useOurService) return false
  if (user.blocked) return true
  if (!user.createdAt) return false

  const totalUsed = INITIAL_TOKENS - currentFreeTokens
  const age = Date.now() - user.createdAt.getTime()

  if (totalUsed > INITIAL_TOKENS * BURN_THRESHOLD && age < BURN_WINDOW_MS) {
    logger.warn(`Auto-blocked ${telegramId}: burned ${totalUsed} tokens in ${Math.round(age / 1000)}s`)
    await prisma.user.update({
      where: { telegramId },
      data: { blocked: true, blockedReason: 'Rapid token consumption (anti-abuse)' },
    })
    return true
  }

  return false
}

export async function checkRepoAbuse(repoUrl: string, telegramId: string): Promise<boolean> {
  const blockedWithRepo = await prisma.user.findFirst({
    where: { githubRepo: repoUrl, blocked: true, telegramId: { not: telegramId } },
  })

  if (blockedWithRepo) {
    logger.warn(`Auto-blocked ${telegramId}: tried to use repo ${repoUrl} used by blocked user ${blockedWithRepo.telegramId}`)
    await prisma.user.update({
      where: { telegramId },
      data: { blocked: true, blockedReason: `Repo used by blocked user (${blockedWithRepo.telegramId})` },
    })
    return true
  }

  return false
}
