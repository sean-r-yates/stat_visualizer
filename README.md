# Stat Visualizer

Round 5 upload dashboard for trusted traders. The web app queues uploaded `.py` files, a worker runs `rust_backtester`, stdout is parsed into per-product scores, and the dashboard keeps only the current winning file for each product.

## Stack

- `Next.js 16` + `React 19`
- `Postgres` for persistent winners, uploads, and terminal history
- `BullMQ` + `Render Key Value` for the one-at-a-time queue
- `rust_backtester 0.4.0` inside the worker container

## Local commands

```bash
pnpm dev
pnpm worker
pnpm typecheck
pnpm build
```

## Required environment variables

### Web service

- `APP_SECRET_SLUG`
- `DATABASE_URL`
- `REDIS_URL`

### Worker

- `APP_SECRET_SLUG`
- `DATABASE_URL`
- `REDIS_URL`
- `BACKTEST_COMMAND`
- `BACKTEST_WORKDIR`

The worker expects `BACKTEST_COMMAND` to contain a `{file}` placeholder.

Example:

```bash
rust_backtester --trader {file} --dataset round5 --products full --artifact-mode none
```

## Render setup

The repo includes a `render.yaml` blueprint and a worker `Dockerfile`.

### What to create

1. Create a new Render Blueprint from this repo.
2. Let it create:
   - `stat-visualizer-web`
   - `stat-visualizer-worker`
   - `stat-visualizer-db`
   - `stat-visualizer-queue`
3. Keep the Key Value region the same as the web service and database.
4. Leave the Key Value eviction policy at `noeviction`.
5. After the first deploy, open the web service environment page and copy the generated `APP_SECRET_SLUG`.
6. Confirm the worker received the same `APP_SECRET_SLUG` through the blueprint link.

### Access URL

The dashboard lives at:

```text
/r/<APP_SECRET_SLUG>
```

The root path returns a 404 on purpose.

### Health check

Render should use `/healthz` as the web service health check path.

## Notes on the worker

- The worker image installs `rust_backtester 0.4.0` with Cargo.
- The app parses terminal stdout instead of reading artifact files.
- Successful non-winning uploads are discarded automatically.
- If a winning file is deleted, its products fall back to `No attempt`.
