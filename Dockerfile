FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile

COPY prisma/ prisma/
RUN pnpm prisma generate

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm build

FROM node:24-alpine

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY prisma/ prisma/
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/.prisma/ node_modules/.prisma/

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma db push --accept-data-loss && node dist/index.js"]
