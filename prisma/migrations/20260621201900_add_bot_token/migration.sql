-- AlterTable
ALTER TABLE "users" ADD COLUMN     "botToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_botToken_key" ON "users"("botToken");
