FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install

COPY prisma/ prisma/
RUN pnpm prisma generate

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --prod

COPY prisma/ prisma/
COPY --from=builder /app/dist/ dist/

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma db push --accept-data-loss && node dist/index.js"]
