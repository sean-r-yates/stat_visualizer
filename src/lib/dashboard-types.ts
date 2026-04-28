import type { ProductKey } from "@/lib/products";

export type ProductCellSnapshot = {
  product: ProductKey;
  label: string;
  totalPnl: number | null;
  meanPnl: number | null;
  pnlRange: number | null;
  fileName: string | null;
  uploadId: string | null;
  winCount: number;
};

export type FamilySnapshot = {
  key: string;
  title: string;
  color: string;
  products: ProductCellSnapshot[];
};

export type TerminalEntry = {
  id: number;
  eventType: string;
  message: string;
  createdAt: string;
};

export type DashboardSnapshot = {
  families: FamilySnapshot[];
  expectedProfit: number;
  summaryLines: string[];
  activeJobs: number;
  statusCounts: Record<string, number>;
  terminalEvents: TerminalEntry[];
};

export function formatMetric(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
