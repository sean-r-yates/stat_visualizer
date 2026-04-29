import "server-only";

import { ensureSchema, getSql } from "@/lib/db";
import {
  formatMetric,
  type DashboardSnapshot,
  type ProductCellSnapshot,
} from "@/lib/dashboard-types";
import { FAMILIES, type ProductKey, productLabel } from "@/lib/products";

function compareCells(left: ProductCellSnapshot, right: ProductCellSnapshot): number {
  if (left.totalPnl === null && right.totalPnl === null) {
    return 0;
  }

  if (left.totalPnl === null) {
    return 1;
  }

  if (right.totalPnl === null) {
    return -1;
  }

  if (left.totalPnl !== right.totalPnl) {
    return right.totalPnl - left.totalPnl;
  }

  if (left.pnlRange === null && right.pnlRange === null) {
    return 0;
  }

  if (left.pnlRange === null) {
    return 1;
  }

  if (right.pnlRange === null) {
    return -1;
  }

  return left.pnlRange - right.pnlRange;
}

export async function buildDashboardSnapshot(): Promise<DashboardSnapshot> {
  await ensureSchema();
  const sql = getSql();

  const [winnerRows, statusRows, completedRows, terminalRows] = await Promise.all([
    sql<{
      product_key: ProductKey;
      day_2_pnl: number | null;
      day_3_pnl: number | null;
      day_4_pnl: number | null;
      total_pnl: number | null;
      mean_pnl: number | null;
      pnl_range: number | null;
      upload_id: string | null;
      stored_name: string | null;
      win_count: number | null;
    }[]>`
      select
        pw.product_key,
        rr.day_2_pnl,
        rr.day_3_pnl,
        rr.day_4_pnl,
        pw.total_pnl,
        pw.mean_pnl,
        pw.pnl_range,
        pw.upload_id,
        u.stored_name,
        coalesce(wc.win_count, 0) as win_count
      from product_winners pw
      left join uploads u
        on u.id = pw.upload_id
      left join run_results rr
        on rr.upload_id = pw.upload_id
       and rr.product_key = pw.product_key
      left join (
        select upload_id, count(*)::int as win_count
        from product_winners
        where upload_id is not null
        group by upload_id
      ) wc
        on wc.upload_id = pw.upload_id
    `,
    sql<{ status: string; count: number }[]>`
      select status, count(*)::int as count
      from uploads
      group by status
    `,
    sql<{ count: number }[]>`
      with completed_upload_ids as (
        select distinct upload_id
        from run_results
        union
        select distinct upload_id
        from terminal_events
        where event_type = 'completed'
          and upload_id is not null
      )
      select count(*)::int as count
      from completed_upload_ids
    `,
    sql<{
      id: number;
      event_type: string;
      message: string;
      created_at: Date;
    }[]>`
      select id, event_type, message, created_at
      from terminal_events
      order by id asc
      limit 200
    `,
  ]);

  const winnerByProduct = new Map(winnerRows.map((row) => [row.product_key, row]));
  const statusCounts: Record<string, number> = {
    ...Object.fromEntries(statusRows.map((row) => [row.status, row.count])),
    completed: completedRows[0]?.count ?? 0,
  };

  const families = FAMILIES.map((family) => {
    const products = family.products
      .map<ProductCellSnapshot>((product) => {
        const winner = winnerByProduct.get(product);

        return {
          product,
          label: productLabel(product),
          day2Pnl: winner?.day_2_pnl ?? null,
          day3Pnl: winner?.day_3_pnl ?? null,
          day4Pnl: winner?.day_4_pnl ?? null,
          totalPnl: winner?.total_pnl ?? null,
          meanPnl: winner?.mean_pnl ?? null,
          pnlRange: winner?.pnl_range ?? null,
          fileName: winner?.stored_name ?? (winner?.upload_id ? `upload ${winner.upload_id}` : null),
          uploadId: winner?.upload_id ?? null,
          winCount: winner?.win_count ?? 0,
        };
      })
      .sort(compareCells);

    return {
      key: family.key,
      title: family.title,
      color: family.color,
      products,
    };
  });

  const summaryLines = families.flatMap((family) =>
    family.products.map((product) => {
      if (product.fileName && product.totalPnl !== null) {
        return `${product.product} - ${product.fileName} - ${formatMetric(product.totalPnl)}`;
      }

      return `${product.product} - No attempt - No attempt`;
    }),
  );

  const expectedProfit = families
    .flatMap((family) => family.products)
    .reduce((sum, product) => sum + (product.totalPnl ?? 0), 0);

  return {
    families,
    expectedProfit,
    summaryLines,
    activeJobs: (statusCounts.uploaded ?? 0) + (statusCounts.running ?? 0),
    statusCounts,
    terminalEvents: terminalRows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      message: row.message,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
