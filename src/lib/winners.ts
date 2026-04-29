import { ensureSchema, getSql } from "@/lib/db";
import { type ParsedProductMetrics } from "@/lib/backtester-parser";
import type { ProductKey } from "@/lib/products";

type CurrentWinnerRow = {
  product_key: ProductKey;
  upload_id: string | null;
  day_2_pnl: number | null;
  day_3_pnl: number | null;
  day_4_pnl: number | null;
  mean_pnl: number | null;
  total_pnl: number | null;
  pnl_range: number | null;
  upload_created_at: Date | null;
};

export type RebuildProductWinnersResult = {
  refreshedProducts: number;
};

function hasNoNegativeDays(dailyPnls: readonly number[]): boolean {
  return dailyPnls.every((pnl) => pnl >= 0);
}

function isCandidateBetter(
  candidate: ParsedProductMetrics,
  current: CurrentWinnerRow | undefined,
  candidateCreatedAt: Date,
): boolean {
  if (
    !current ||
    current.upload_id === null ||
    current.day_2_pnl === null ||
    current.day_3_pnl === null ||
    current.day_4_pnl === null ||
    current.mean_pnl === null ||
    current.total_pnl === null ||
    current.pnl_range === null
  ) {
    return true;
  }

  const candidateHasNoNegativeDays = hasNoNegativeDays(candidate.dailyPnls);
  const currentHasNoNegativeDays = hasNoNegativeDays([
    current.day_2_pnl,
    current.day_3_pnl,
    current.day_4_pnl,
  ]);

  if (candidateHasNoNegativeDays !== currentHasNoNegativeDays) {
    return candidateHasNoNegativeDays;
  }

  if (candidate.meanPnl !== current.mean_pnl) {
    return candidate.meanPnl > current.mean_pnl;
  }

  if (candidate.totalPnl !== current.total_pnl) {
    return candidate.totalPnl > current.total_pnl;
  }

  if (candidate.pnlRange !== current.pnl_range) {
    return candidate.pnlRange < current.pnl_range;
  }

  if (!current.upload_created_at) {
    return true;
  }

  return candidateCreatedAt > current.upload_created_at;
}

export async function finalizeSuccessfulUpload(input: {
  uploadId: string;
  rawLog: string;
  metrics: ParsedProductMetrics[];
}): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql.begin(async (transaction) => {
    const [upload] = await transaction<{ created_at: Date }[]>`
      update uploads
      set status = 'completed', raw_log = ${input.rawLog}, error_log = null, completed_at = now()
      where id = ${input.uploadId}
      returning created_at
    `;

    if (!upload) {
      return;
    }

    for (const metric of input.metrics) {
      const [day2Pnl, day3Pnl, day4Pnl] = metric.dailyPnls;

      await transaction`
        insert into run_results (
          upload_id,
          product_key,
          day_2_pnl,
          day_3_pnl,
          day_4_pnl,
          total_pnl,
          mean_pnl,
          pnl_range
        )
        values (
          ${input.uploadId},
          ${metric.product},
          ${day2Pnl},
          ${day3Pnl},
          ${day4Pnl},
          ${metric.totalPnl},
          ${metric.meanPnl},
          ${metric.pnlRange}
        )
        on conflict (upload_id, product_key) do update
        set
          day_2_pnl = excluded.day_2_pnl,
          day_3_pnl = excluded.day_3_pnl,
          day_4_pnl = excluded.day_4_pnl,
          total_pnl = excluded.total_pnl,
          mean_pnl = excluded.mean_pnl,
          pnl_range = excluded.pnl_range
      `;
    }

    const currentRows = await transaction<CurrentWinnerRow[]>`
      select
        pw.product_key,
        pw.upload_id,
        rr.day_2_pnl,
        rr.day_3_pnl,
        rr.day_4_pnl,
        pw.mean_pnl,
        pw.total_pnl,
        pw.pnl_range,
        (
          select u.created_at
          from uploads u
          where u.id = pw.upload_id
        ) as upload_created_at
      from product_winners pw
      left join run_results rr
        on rr.upload_id = pw.upload_id
       and rr.product_key = pw.product_key
      for update
    `;

    const currentByProduct = new Map(currentRows.map((row) => [row.product_key, row]));

    for (const metric of input.metrics) {
      const currentWinner = currentByProduct.get(metric.product);

      if (!isCandidateBetter(metric, currentWinner, upload.created_at)) {
        continue;
      }

      await transaction`
        insert into product_winners (product_key, upload_id, total_pnl, mean_pnl, pnl_range, updated_at)
        values (
          ${metric.product},
          ${input.uploadId},
          ${metric.totalPnl},
          ${metric.meanPnl},
          ${metric.pnlRange},
          now()
        )
        on conflict (product_key) do update
        set
          upload_id = excluded.upload_id,
          total_pnl = excluded.total_pnl,
          mean_pnl = excluded.mean_pnl,
          pnl_range = excluded.pnl_range,
          updated_at = excluded.updated_at
      `;
    }

    await transaction`
      delete from uploads u
      where u.status = 'completed'
        and not exists (
          select 1
          from product_winners pw
          where pw.upload_id = u.id
        )
    `;
  });
}

export async function finalizeFailedUpload(input: {
  uploadId: string;
  rawLog: string;
  errorLog: string;
}): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql`
    update uploads
    set
      status = 'failed',
      raw_log = ${input.rawLog},
      error_log = ${input.errorLog},
      completed_at = now()
    where id = ${input.uploadId}
  `;
}

export async function rebuildProductWinnersFromRunResults(): Promise<RebuildProductWinnersResult> {
  await ensureSchema();
  const sql = getSql();

  return sql.begin(async (transaction) => {
    await transaction`delete from product_winners`;

    const rebuiltRows = await transaction<{ product_key: ProductKey }[]>`
      with ranked_results as (
        select
          rr.upload_id,
          rr.product_key,
          rr.total_pnl,
          rr.mean_pnl,
          rr.pnl_range,
          row_number() over (
            partition by rr.product_key
            order by
              case
                when rr.day_2_pnl >= 0
                 and rr.day_3_pnl >= 0
                 and rr.day_4_pnl >= 0
                then 1
                else 0
              end desc,
              rr.mean_pnl desc,
              rr.total_pnl desc,
              rr.pnl_range asc,
              coalesce(u.created_at, rr.created_at) desc,
              rr.upload_id desc
          ) as winner_rank
        from run_results rr
        left join uploads u
          on u.id = rr.upload_id
      )
      insert into product_winners (product_key, upload_id, total_pnl, mean_pnl, pnl_range, updated_at)
      select
        product_key,
        upload_id,
        total_pnl,
        mean_pnl,
        pnl_range,
        now()
      from ranked_results
      where winner_rank = 1
      returning product_key
    `;

    return {
      refreshedProducts: rebuiltRows.length,
    };
  });
}

export async function deleteWinningUpload(uploadId: string): Promise<number> {
  await ensureSchema();
  const sql = getSql();

  return sql.begin(async (transaction) => {
    const winningRows = await transaction<{ product_key: string }[]>`
      select product_key
      from product_winners
      where upload_id = ${uploadId}
      for update
    `;

    if (winningRows.length === 0) {
      return 0;
    }

    await transaction`
      update product_winners
      set
        upload_id = null,
        total_pnl = null,
        mean_pnl = null,
        pnl_range = null,
        updated_at = now()
      where upload_id = ${uploadId}
    `;

    await transaction`
      delete from uploads
      where id = ${uploadId}
    `;

    return winningRows.length;
  });
}
