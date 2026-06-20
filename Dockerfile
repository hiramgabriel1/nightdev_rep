FROM node:24-alpine AS builder

ENV PNPM_ONLY_BUILT_DEPENDENCIES='["@prisma/engines","prisma","esbuild","ssh2","cpu-features"]'

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY prisma/ prisma/
RUN pnpm prisma generate

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm build

FROM node:24-alpine

ENV PNPM_ONLY_BUILT_DEPENDENCIES='["@prisma/engines","prisma","esbuild","ssh2","cpu-features"]'
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod

COPY prisma/ prisma/
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/.prisma/ node_modules/.prisma/

EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma db push --accept-data-loss && node dist/index.js"]
