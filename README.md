# Stat Visualizer

Round 5 upload dashboard for trusted traders. The web app runs uploaded `.py` files directly through `rust_backtester`, parses stdout into per-product scores, and keeps only the current winning file for each product.

## Stack

- `Next.js 16` + `React 19`
- `Postgres` for persistent winners, uploads, and terminal history
- `rust_backtester 0.4.0` inside the web container
- `DigitalOcean App Platform` for the public web app

## Local commands

```bash
pnpm dev
pnpm typecheck
pnpm build
```

## Required environment variables

### Web service

- `APP_SECRET_SLUG`
- `DATABASE_URL`
- `BACKTEST_COMMAND`
- `BACKTEST_WORKDIR`

The app expects `BACKTEST_COMMAND` to contain a `{file}` placeholder.

Example:

```bash
rust_backtester --trader {file} --dataset round5 --products full --artifact-mode none
```

## DigitalOcean setup

The repo now ships with a DigitalOcean App Platform spec at `.do/app.yaml`.

### Before you deploy

1. Create a Managed PostgreSQL cluster in DigitalOcean.
2. Edit `.do/app.yaml` and replace:
   - `replace-with-region-slug`
   - `replace-with-existing-postgres-cluster-name`
   - `replace-with-your-github-owner/stat_visualizer`
   - `replace-with-a-long-random-secret`
3. Use the same DigitalOcean region for App Platform and PostgreSQL.

### Deploy

You can deploy either from the App Platform UI or with `doctl`.

#### Option 1: App Platform UI

1. Push this repo to GitHub.
2. In DigitalOcean, create a new App Platform app from GitHub or use `doctl apps create --spec .do/app.yaml`.
3. Apply the settings from `.do/app.yaml`.
4. Verify the app component:
   - `stat-web`
5. Verify the bound database:
   - `stat-db`

#### Option 2: CLI

```bash
doctl apps create --spec .do/app.yaml
```

## Access URL

The dashboard lives at:

```text
/r/<APP_SECRET_SLUG>
```

The root path returns a 404 on purpose.

## Notes on processing

- The app container installs `rust_backtester 0.4.0` with Cargo.
- The app parses terminal stdout instead of reading artifact files.
- Uploads are processed directly in the app, one at a time.
- Successful non-winning uploads are discarded automatically.
- If a winning file is deleted, its products fall back to `No attempt`.
