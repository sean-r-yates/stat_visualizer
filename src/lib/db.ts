import postgres, { type Sql } from "postgres";

import { getServerEnv } from "@/lib/env";

let sqlClient: Sql | null = null;
let schemaPromise: Promise<void> | null = null;

export function getSql(): Sql {
  if (!sqlClient) {
    sqlClient = postgres(getServerEnv().DATABASE_URL, {
      idle_timeout: 20,
      max: 5,
      prepare: false,
    });
  }

  return sqlClient;
}

export async function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();

      await sql`
        create table if not exists uploads (
          id text primary key,
          original_name text not null,
          stored_name text not null unique,
          source_code text not null,
          status text not null,
          created_at timestamptz not null default now(),
          started_at timestamptz,
          completed_at timestamptz,
          raw_log text,
          error_log text
        )
      `;

      await sql`
        create index if not exists uploads_status_idx on uploads (status)
      `;

      await sql`
        create table if not exists run_results (
          upload_id text not null,
          product_key text not null,
          day_2_pnl double precision not null,
          day_3_pnl double precision not null,
          day_4_pnl double precision not null,
          total_pnl double precision not null,
          mean_pnl double precision not null,
          pnl_range double precision not null,
          created_at timestamptz not null default now(),
          primary key (upload_id, product_key)
        )
      `;

      await sql`
        create index if not exists run_results_product_rank_idx
        on run_results (product_key, total_pnl desc, pnl_range asc)
      `;

      await sql`
        create index if not exists run_results_upload_idx on run_results (upload_id)
      `;

      await sql`
        create table if not exists product_winners (
          product_key text primary key,
          upload_id text,
          total_pnl double precision,
          mean_pnl double precision,
          pnl_range double precision,
          updated_at timestamptz not null default now()
        )
      `;

      await sql`
        alter table product_winners
        drop constraint if exists product_winners_upload_id_fkey
      `;

      await sql`
        create table if not exists terminal_events (
          id bigint generated always as identity primary key,
          event_type text not null,
          message text not null,
          upload_id text,
          stored_name text,
          created_at timestamptz not null default now()
        )
      `;
    })();
  }

  await schemaPromise;
}
