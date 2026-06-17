/*
  Warnings:

  - You are about to drop the column `apiKey` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `botToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `mode` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "apiKey",
DROP COLUMN "botToken",
DROP COLUMN "mode",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "languageCode" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "opencodeApiKey" TEXT,
ADD COLUMN     "tgApiKey" TEXT,
ADD COLUMN     "useOurService" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "UserMode";
