import { ensureSchema, getSql } from "@/lib/db";
import { type ParsedProductMetrics } from "@/lib/backtester-parser";
import type { ProductKey } from "@/lib/products";

type CurrentWinnerRow = {
  product_key: ProductKey;
  upload_id: string | null;
  total_pnl: number | null;
  pnl_range: number | null;
  upload_created_at: Date | null;
};

function isCandidateBetter(
  candidate: ParsedProductMetrics,
  current: CurrentWinnerRow | undefined,
  candidateCreatedAt: Date,
): boolean {
  if (!current || current.upload_id === null || current.total_pnl === null || current.pnl_range === null) {
    return true;
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
        pw.total_pnl,
        pw.pnl_range,
        (
          select u.created_at
          from uploads u
          where u.id = pw.upload_id
        ) as upload_created_at
      from product_winners pw
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
