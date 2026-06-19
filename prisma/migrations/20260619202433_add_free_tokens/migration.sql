-- AlterTable
ALTER TABLE "users" ADD COLUMN     "freeTokens" INTEGER NOT NULL DEFAULT 100000,
ADD COLUMN     "githubBranch" TEXT NOT NULL DEFAULT 'main',
ADD COLUMN     "githubDeployKeyDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "githubRepo" TEXT;
