FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  libssl-dev \
  pkg-config \
  python3 \
  python3-dev \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:$PATH"

RUN cargo install rust_backtester --version 0.4.0

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json next-env.d.ts next.config.ts ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]
