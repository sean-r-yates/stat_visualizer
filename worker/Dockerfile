FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential ca-certificates curl pkg-config python3 libssl-dev \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

ENV PATH="/root/.cargo/bin:${PATH}"
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json next-env.d.ts next.config.ts ./
COPY src ./src
COPY worker ./worker

RUN cargo install rust_backtester --version 0.4.0
RUN pnpm install --frozen-lockfile

CMD ["pnpm", "worker"]
