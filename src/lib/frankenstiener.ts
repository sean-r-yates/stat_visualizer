import "server-only";

import { ensureSchema, getSql } from "@/lib/db";
import {
  type FrankenstienerCandidate,
  type FrankenstienerFamily,
  type FrankenstienerPreset,
  type FrankenstienerSnapshot,
  type PredictionSummary,
} from "@/lib/frankenstiener-types";
import { FAMILIES, type ProductKey, productLabel } from "@/lib/products";

type CandidateRow = {
  product_key: ProductKey;
  upload_id: string;
  strategy_name: string | null;
  day_2_pnl: number;
  day_3_pnl: number;
  day_4_pnl: number;
  total_pnl: number;
  mean_pnl: number;
  pnl_range: number;
  created_at: Date;
};

type WinnerRow = {
  product_key: ProductKey;
  upload_id: string | null;
};

const EMPTY_SUMMARY: PredictionSummary = {
  min: 0,
  lowerQuartile: 0,
  mean: 0,
  upperQuartile: 0,
  max: 0,
};

function percentile(sortedValues: readonly number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = (sortedValues.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const ratio = position - lowerIndex;
  return sortedValues[lowerIndex] + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * ratio;
}

function summarizeDailyPnls(dayPnls: readonly [number, number, number]): PredictionSummary {
  const sortedValues = [...dayPnls].sort((left, right) => left - right);

  return {
    min: sortedValues[0],
    lowerQuartile: percentile(sortedValues, 0.25),
    mean: (dayPnls[0] + dayPnls[1] + dayPnls[2]) / dayPnls.length,
    upperQuartile: percentile(sortedValues, 0.75),
    max: sortedValues[sortedValues.length - 1],
  };
}

function sumSummaries(candidates: FrankenstienerCandidate[]): PredictionSummary {
  return candidates.reduce<PredictionSummary>(
    (summary, candidate) => ({
      min: summary.min + candidate.summary.min,
      lowerQuartile: summary.lowerQuartile + candidate.summary.lowerQuartile,
      mean: summary.mean + candidate.summary.mean,
      upperQuartile: summary.upperQuartile + candidate.summary.upperQuartile,
      max: summary.max + candidate.summary.max,
    }),
    { ...EMPTY_SUMMARY },
  );
}

function hasNoNegativeDays(candidate: FrankenstienerCandidate): boolean {
  return candidate.day2Pnl >= 0 && candidate.day3Pnl >= 0 && candidate.day4Pnl >= 0;
}

function hasAnyNonZeroDay(candidate: FrankenstienerCandidate): boolean {
  return candidate.day2Pnl !== 0 || candidate.day3Pnl !== 0 || candidate.day4Pnl !== 0;
}

function worstDayPnl(candidate: FrankenstienerCandidate): number {
  return Math.min(candidate.day2Pnl, candidate.day3Pnl, candidate.day4Pnl);
}

function newestFirst(left: FrankenstienerCandidate, right: FrankenstienerCandidate): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function compareNumberDesc(left: number, right: number): number {
  return right - left;
}

function compareNumberAsc(left: number, right: number): number {
  return left - right;
}

function byCandidateLabel(left: FrankenstienerCandidate, right: FrankenstienerCandidate): number {
  if (left.totalPnl !== right.totalPnl) {
    return compareNumberDesc(left.totalPnl, right.totalPnl);
  }

  if (left.meanPnl !== right.meanPnl) {
    return compareNumberDesc(left.meanPnl, right.meanPnl);
  }

  if (left.pnlRange !== right.pnlRange) {
    return compareNumberAsc(left.pnlRange, right.pnlRange);
  }

  return newestFirst(left, right);
}

function pickFirst(candidates: FrankenstienerCandidate[]): FrankenstienerCandidate | null {
  return candidates[0] ?? null;
}

function buildSelection(
  candidatesByProduct: Map<ProductKey, FrankenstienerCandidate[]>,
  selector: (product: ProductKey, candidates: FrankenstienerCandidate[]) => FrankenstienerCandidate | null,
): { selectedCandidates: FrankenstienerCandidate[]; selection: Record<ProductKey, string> } {
  const selection = {} as Record<ProductKey, string>;
  const selectedCandidates: FrankenstienerCandidate[] = [];

  for (const family of FAMILIES) {
    for (const product of family.products) {
      const candidate = selector(product, candidatesByProduct.get(product) ?? []);

      if (!candidate) {
        continue;
      }

      selection[product] = candidate.id;
      selectedCandidates.push(candidate);
    }
  }

  return { selection, selectedCandidates };
}

function makePreset(input: {
  key: string;
  label: string;
  candidatesByProduct: Map<ProductKey, FrankenstienerCandidate[]>;
  selector: (product: ProductKey, candidates: FrankenstienerCandidate[]) => FrankenstienerCandidate | null;
}): FrankenstienerPreset {
  const { selection, selectedCandidates } = buildSelection(input.candidatesByProduct, input.selector);

  return {
    key: input.key,
    label: input.label,
    selection,
    selectedCount: selectedCandidates.length,
    summary: sumSummaries(selectedCandidates),
  };
}

function buildCandidate(row: CandidateRow): FrankenstienerCandidate {
  const dailyPnls: [number, number, number] = [row.day_2_pnl, row.day_3_pnl, row.day_4_pnl];

  return {
    id: `${row.product_key}:${row.upload_id}`,
    product: row.product_key,
    uploadId: row.upload_id,
    strategyName: row.strategy_name ?? row.upload_id,
    day2Pnl: row.day_2_pnl,
    day3Pnl: row.day_3_pnl,
    day4Pnl: row.day_4_pnl,
    totalPnl: row.total_pnl,
    meanPnl: row.mean_pnl,
    pnlRange: row.pnl_range,
    createdAt: row.created_at.toISOString(),
    summary: summarizeDailyPnls(dailyPnls),
  };
}

export function calculateFrankenstienerSummary(candidates: FrankenstienerCandidate[]): PredictionSummary {
  return sumSummaries(candidates);
}

export async function buildFrankenstienerSnapshot(): Promise<FrankenstienerSnapshot> {
  await ensureSchema();
  const sql = getSql();

  const [candidateRows, winnerRows] = await Promise.all([
    sql<CandidateRow[]>`
      select
        rr.product_key,
        rr.upload_id,
        u.stored_name as strategy_name,
        rr.day_2_pnl,
        rr.day_3_pnl,
        rr.day_4_pnl,
        rr.total_pnl,
        rr.mean_pnl,
        rr.pnl_range,
        coalesce(u.created_at, rr.created_at) as created_at
      from run_results rr
      left join uploads u
        on u.id = rr.upload_id
      order by rr.product_key asc, rr.total_pnl desc, rr.mean_pnl desc, rr.pnl_range asc
    `,
    sql<WinnerRow[]>`
      select product_key, upload_id
      from product_winners
      where upload_id is not null
    `,
  ]);

  const candidatesByProduct = new Map<ProductKey, FrankenstienerCandidate[]>();

  for (const row of candidateRows) {
    const candidate = buildCandidate(row);
    const candidates = candidatesByProduct.get(candidate.product) ?? [];
    candidates.push(candidate);
    candidatesByProduct.set(candidate.product, candidates);
  }

  for (const candidates of candidatesByProduct.values()) {
    candidates.sort(byCandidateLabel);
  }

  const winnerUploadByProduct = new Map(winnerRows.map((row) => [row.product_key, row.upload_id]));

  const presets: FrankenstienerPreset[] = [
    makePreset({
      key: "the-winners",
      label: "the winners",
      candidatesByProduct,
      selector: (product, candidates) => {
        const winningUploadId = winnerUploadByProduct.get(product);
        return candidates.find((candidate) => candidate.uploadId === winningUploadId) ?? null;
      },
    }),
    makePreset({
      key: "super-risk-verse",
      label: "super risk verse",
      candidatesByProduct,
      selector: (_product, candidates) =>
        pickFirst(
          candidates
            .filter(hasNoNegativeDays)
            .sort(
              (left, right) =>
                compareNumberDesc(worstDayPnl(left), worstDayPnl(right)) ||
                compareNumberDesc(left.meanPnl, right.meanPnl) ||
                compareNumberDesc(left.totalPnl, right.totalPnl) ||
                compareNumberAsc(left.pnlRange, right.pnlRange) ||
                newestFirst(left, right),
            ),
        ),
    }),
    makePreset({
      key: "super-consistent",
      label: "super consistent",
      candidatesByProduct,
      selector: (_product, candidates) =>
        pickFirst(
          candidates
            .filter((candidate) => hasNoNegativeDays(candidate) && hasAnyNonZeroDay(candidate))
            .sort(
              (left, right) =>
                compareNumberAsc(left.pnlRange, right.pnlRange) ||
                compareNumberDesc(left.meanPnl, right.meanPnl) ||
                compareNumberDesc(left.totalPnl, right.totalPnl) ||
                newestFirst(left, right),
            ),
        ),
    }),
    makePreset({
      key: "full-send",
      label: "full send",
      candidatesByProduct,
      selector: (_product, candidates) =>
        pickFirst(
          [...candidates].sort(
            (left, right) =>
              compareNumberDesc(left.totalPnl, right.totalPnl) ||
              compareNumberDesc(left.meanPnl, right.meanPnl) ||
              compareNumberAsc(left.pnlRange, right.pnlRange) ||
              newestFirst(left, right),
          ),
        ),
    }),
    makePreset({
      key: "all-green",
      label: "all green",
      candidatesByProduct,
      selector: (_product, candidates) =>
        pickFirst(
          candidates
            .filter((candidate) => hasNoNegativeDays(candidate) && candidate.pnlRange < candidate.meanPnl)
            .sort(
              (left, right) =>
                compareNumberDesc(left.meanPnl, right.meanPnl) ||
                compareNumberDesc(left.totalPnl, right.totalPnl) ||
                compareNumberAsc(left.pnlRange, right.pnlRange) ||
                newestFirst(left, right),
            ),
        ),
    }),
  ].sort((left, right) => compareNumberAsc(left.summary.mean, right.summary.mean));

  const families: FrankenstienerFamily[] = FAMILIES.map((family) => ({
    key: family.key,
    title: family.title,
    color: family.color,
    products: family.products.map((product) => ({
      product,
      label: productLabel(product),
      candidates: candidatesByProduct.get(product) ?? [],
    })),
  }));

  return {
    families,
    presets,
    emptySummary: EMPTY_SUMMARY,
  };
}
