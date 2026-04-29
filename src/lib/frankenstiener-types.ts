import type { ProductKey } from "@/lib/products";

export type PredictionSummary = {
  min: number;
  lowerQuartile: number;
  mean: number;
  upperQuartile: number;
  max: number;
};

export type FrankenstienerCandidate = {
  id: string;
  product: ProductKey;
  uploadId: string;
  strategyName: string;
  day2Pnl: number;
  day3Pnl: number;
  day4Pnl: number;
  totalPnl: number;
  meanPnl: number;
  pnlRange: number;
  createdAt: string;
  summary: PredictionSummary;
};

export type FrankenstienerProduct = {
  product: ProductKey;
  label: string;
  candidates: FrankenstienerCandidate[];
};

export type FrankenstienerFamily = {
  key: string;
  title: string;
  color: string;
  products: FrankenstienerProduct[];
};

export type FrankenstienerPreset = {
  key: string;
  label: string;
  selection: Record<ProductKey, string>;
  selectedCount: number;
  summary: PredictionSummary;
};

export type FrankenstienerSnapshot = {
  families: FrankenstienerFamily[];
  presets: FrankenstienerPreset[];
  emptySummary: PredictionSummary;
};
