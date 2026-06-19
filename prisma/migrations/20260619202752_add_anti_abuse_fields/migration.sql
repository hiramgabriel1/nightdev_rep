-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "lastRequestAt" TIMESTAMP(3);
