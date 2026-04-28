import { PRODUCT_KEYS, type ProductKey } from "@/lib/products";

export type ParsedProductMetrics = {
  product: ProductKey;
  dailyPnls: [number, number, number];
  totalPnl: number;
  meanPnl: number;
  pnlRange: number;
};

const KNOWN_PRODUCTS = new Set<ProductKey>(PRODUCT_KEYS);

function isProductKey(value: string): value is ProductKey {
  return KNOWN_PRODUCTS.has(value as ProductKey);
}

export function parseBacktesterOutput(rawOutput: string): ParsedProductMetrics[] {
  const parsedMetrics = new Map<ProductKey, ParsedProductMetrics>();
  const lines = rawOutput.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 5 || !isProductKey(parts[0])) {
      continue;
    }

    const d2 = Number.parseFloat(parts[1]);
    const d3 = Number.parseFloat(parts[2]);
    const d4 = Number.parseFloat(parts[3]);
    const total = Number.parseFloat(parts[4]);

    if ([d2, d3, d4, total].some((value) => Number.isNaN(value))) {
      continue;
    }

    const min = Math.min(d2, d3, d4);
    const max = Math.max(d2, d3, d4);

    parsedMetrics.set(parts[0], {
      product: parts[0],
      dailyPnls: [d2, d3, d4],
      totalPnl: total,
      meanPnl: (d2 + d3 + d4) / 3,
      pnlRange: max - min,
    });
  }

  const missingProducts = PRODUCT_KEYS.filter((product) => !parsedMetrics.has(product));
  if (missingProducts.length > 0) {
    throw new Error(
      `Backtester output is missing ${missingProducts.length} products. First missing product: ${missingProducts[0]}.`,
    );
  }

  return PRODUCT_KEYS.map((product) => parsedMetrics.get(product)!);
}
