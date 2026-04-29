# Stat Visualizer

Stat Visualizer is a private Round 5 dashboard for uploading Python traders, running a backtest, parsing the terminal output, and showing the current best file for each of the 50 tradable products.

The app is built for a small trusted group using a shared secret URL instead of a full auth system. It is currently set up for deployment on DigitalOcean App Platform with a managed PostgreSQL database.

## What the app does

- Accepts one or many `.py` files by button upload or drag and drop
- Processes uploads one at a time
- Runs each file through `rust_backtester`
- Parses stdout for all 50 Round 5 products
- Calculates:
  - `TOTAL PnL`
  - `mean PnL` from `D+2`, `D+3`, and `D+4`
  - `range` as `max(D+2, D+3, D+4) - min(D+2, D+3, D+4)`
- Keeps only the current winning file for each product
- Shows a live terminal panel with `uploaded`, `running`, `completed`, and `failed` events
- Lets users download or delete only current winning files

## Product rules implemented

- Scope is fixed to Round 5 only
- There are 10 product families and 5 products per family
- Each family row is re-sorted by highest current winning `TOTAL PnL`
- Winner tie-breaks are:
  1. higher `TOTAL PnL`
  2. smaller `range`
  3. newer upload
- If a successful upload does not win any product, its source code is deleted automatically
- If a winning upload is deleted, affected product cells become `No attempt`
- Winners are not recomputed from old non-winning runs after deletion
- Failed uploads stay in the database until the terminal is cleared
- Duplicate filenames are renamed automatically:
  - `trader.py`
  - `trader (1).py`
  - `trader (2).py`

## UI behavior

- The root path `/` intentionally returns a 404
- The actual dashboard lives at `/r/<APP_SECRET_SLUG>`
- Empty product cells show `No attempt`
- Each product card shows:
  - total PnL
  - mean
  - range
  - winning filename
- The terminal clear action:
  - clears the visible terminal history
  - deletes failed upload records
  - deletes failed uploaded source files

## Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `postgres` npm client
- `zod`
- `rust_backtester` via `cargo install`
- `DigitalOcean App Platform`
- `DigitalOcean Managed PostgreSQL`

## High-level architecture

The app is a single web service. There is no Redis queue and no separate worker service.

The upload flow is:

1. User uploads one or many `.py` files.
2. Each file is stored in Postgres with status `uploaded`.
3. The app appends an `uploaded` terminal event.
4. The app schedules the file into an in-process sequential promise chain.
5. When the file reaches the front of the chain, its status becomes `running`.
6. The app writes the source code to a temp file.
7. The app runs `rust_backtester` with that temp file path injected into `BACKTEST_COMMAND`.
8. Stdout is parsed for all 50 products.
9. Winners are updated product-by-product.
10. If the upload does not win anything, the upload row is deleted.
11. If the run fails, the upload is stored as `failed` with the raw error log.

## Important operational note

This app currently uses an in-process one-at-a-time chain inside the web service, not a durable external queue.

That means:

- it works best with a single app instance
- a restart during pending work can leave `uploaded` rows waiting in the database
- there is no automatic recovery loop on boot yet

That tradeoff is intentional right now because the queue layer was removed.

## Repository layout

- `src/app/`
  App Router pages, API routes, 404 route, and dashboard UI

- `src/lib/backtest-processor.ts`
  Sequential upload processor and backtester execution

- `src/lib/backtester-parser.ts`
  Stdout parser for Round 5 product rows

- `src/lib/winners.ts`
  Winner comparison logic and deletion behavior

- `src/lib/db.ts`
  Postgres connection and automatic schema creation

- `src/lib/products.ts`
  Product list, family grouping, and labels

- `.do/app.yaml`
  DigitalOcean App Platform spec

- `Dockerfile`
  Production image for App Platform, including `rust_backtester`

## Database schema

The schema is created automatically on first use.

### `uploads`

Stores uploaded source code and run state.

Columns:

- `id`
- `original_name`
- `stored_name`
- `source_code`
- `status`
- `created_at`
- `started_at`
- `completed_at`
- `raw_log`
- `error_log`

Statuses currently used:

- `uploaded`
- `running`
- `completed`
- `failed`

### `run_results`

Stores the persistent backtest metrics for every successful upload/product pair.

Columns:

- `upload_id`
- `product_key`
- `day_2_pnl`
- `day_3_pnl`
- `day_4_pnl`
- `total_pnl`
- `mean_pnl`
- `pnl_range`
- `created_at`

### `product_winners`

Stores the current winning upload for each product.

Columns:

- `product_key`
- `upload_id`
- `total_pnl`
- `mean_pnl`
- `pnl_range`
- `updated_at`

### `terminal_events`

Stores the terminal panel history.

Columns:

- `id`
- `event_type`
- `message`
- `upload_id`
- `stored_name`
- `created_at`

## Backtester output contract

The parser expects stdout lines shaped like this:

```text
PRODUCT_NAME D+2 D+3 D+4 TOTAL
```

Example:

```text
GALAXY_SOUNDS_BLACK_HOLES -136031.00 -140854.00 -158498.00 -435383.00
```

Rules:

- all 50 product rows must be present
- product names must match the known product keys exactly
- each row must include 4 numeric values after the product key

If any products are missing, the run fails.

## Environment variables

The app uses runtime environment variables only.

### Required

- `APP_SECRET_SLUG`
- `DATABASE_URL`
- `BACKTEST_COMMAND`
- `BACKTEST_WORKDIR`

### `BACKTEST_COMMAND`

`BACKTEST_COMMAND` must include either:

- `__FILE__`
- `{file}`

The app replaces that placeholder with the temporary uploaded file path before starting the backtest.

Recommended value:

```text
rust_backtester --trader __FILE__ --artifact-mode none
```

### `BACKTEST_WORKDIR`

Recommended value:

```text
/app
```

## Local development

### Prerequisites

- Node `22.x`
- `pnpm`
- PostgreSQL
- a working backtester command available on your machine

### Install dependencies

```bash
pnpm install
```

### Create a local env file

Create `.env.local` in the repo root with values similar to:

```bash
APP_SECRET_SLUG=local-secret-slug-123456
DATABASE_URL=postgres://user:password@localhost:5432/stat_visualizer
BACKTEST_COMMAND=rust_backtester --trader __FILE__ --artifact-mode none
BACKTEST_WORKDIR=C:/path/to/repo
```

Notes:

- On Windows, `BACKTEST_WORKDIR` can be your repo path if that is where the backtester expects to run.
- If you use a different local backtester executable, only `BACKTEST_COMMAND` needs to change as long as it prints the same stdout table.

### Run the app

```bash
pnpm dev
```

### Build locally

```bash
pnpm typecheck
pnpm build
```

## DigitalOcean deployment

This repo is set up to deploy as a Docker-based App Platform web service.

### Current app spec

`.do/app.yaml` is currently populated with:

- region: `lon1`
- repo: `sean-r-yates/stat_visualizer`
- branch: `main`
- managed database cluster: `db-postgresql-lon1-87688`

You should review and rotate `APP_SECRET_SLUG` before wider sharing.

### What DigitalOcean should create

- 1 App Platform web service
- 1 attached managed PostgreSQL database

There is no worker and no Redis/Valkey component.

### Deployment notes

- Build strategy should be Dockerfile-based
- Public HTTP port should be `3000`
- Instance size should be at least `apps-s-1vcpu-1gb`
- Runtime env vars should be set on the web service
- `DATABASE_URL` should come from the attached managed database bindable variable
- App and database should stay in the same region

### Environment variable values in DigitalOcean

- `APP_SECRET_SLUG`
  - set as a runtime secret

- `DATABASE_URL`
  - use the bindable DigitalOcean value from the attached database component

- `BACKTEST_COMMAND`
  - `rust_backtester --trader __FILE__ --artifact-mode none`

- `BACKTEST_WORKDIR`
  - `/app`

### Access URL

After deploy, the usable dashboard URL is:

```text
https://<your-app-domain>/r/<APP_SECRET_SLUG>
```

The base domain is assigned by DigitalOcean, usually in the form:

```text
https://<app-name>-<random>.ondigitalocean.app
```

## Docker image behavior

The production image:

- starts from `node:22-bookworm-slim`
- installs build tools, Python, Python development headers, Rust, and Cargo
- installs the latest `rust_backtester` available from `cargo install`
- bundles the Round 5 dataset files under `/app/datasets/round5`
- installs Node dependencies with `pnpm`
- builds the Next.js app
- starts the web server on port `3000`

## API routes

The main routes are:

- `GET /healthz`
- `GET /r/[secret]`
- `GET /r/[secret]/api/snapshot`
- `POST /r/[secret]/api/uploads`
- `DELETE /r/[secret]/api/uploads/[uploadId]`
- `GET /r/[secret]/api/uploads/[uploadId]/download`
- `POST /r/[secret]/api/terminal/clear`

## Current limitations

- No durable external queue
- No automatic replay of stuck `uploaded` items after restart
- No auth beyond the shared secret URL
- Scope is hardcoded to Round 5 and the current 50 products
- Successful non-winning uploads are discarded by design
- Backtester integration depends on stdout format staying stable
- Running the backtester inside the web service means long runs directly consume app resources

## Suggested next improvements

- Add restart recovery for lingering `uploaded` rows
- Move processing to a durable queue if concurrency or reliability becomes important
- Add explicit upload history UI
- Add admin controls for retrying failed uploads
- Add health/admin diagnostics for the backtester command
- Move the secret slug out of the committed app spec if the repo becomes public

## Verification status

The current repo has been verified with:

```bash
pnpm typecheck
pnpm build
```

There is currently no automated test suite in the repo.
