"use client";

import type { CSSProperties } from "react";
import { startTransition, useEffect, useMemo, useState } from "react";

import { formatMetric } from "@/lib/dashboard-types";
import type {
  FrankenstienerCandidate,
  FrankenstienerPreset,
  FrankenstienerSnapshot,
  PredictionSummary,
} from "@/lib/frankenstiener-types";
import type { ProductKey } from "@/lib/products";

import styles from "./frankenstiener.module.css";

type FrankenstienerClientProps = {
  secret: string;
  initialSnapshot: FrankenstienerSnapshot;
};

type Selection = Partial<Record<ProductKey, string>>;

const EMPTY_SUMMARY: PredictionSummary = {
  min: 0,
  lowerQuartile: 0,
  mean: 0,
  upperQuartile: 0,
  max: 0,
};

function buildDefaultSelection(snapshot: FrankenstienerSnapshot): Selection {
  return snapshot.presets.find((preset) => preset.key === "the-winners")?.selection ?? {};
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

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function downloadBlueprint(rows: Array<{ asset: ProductKey; strategy: string }>) {
  const csv = [
    ["asset", "python_strategy"].join(","),
    ...rows.map((row) => [csvEscape(row.asset), csvEscape(row.strategy)].join(",")),
  ].join("\r\n");
  const blob = new Blob([`${csv}\r\n`], { type: "text/csv;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = "frankenstiener-blueprint.csv";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

function getScaleBounds(summaries: PredictionSummary[]): { min: number; max: number } {
  const values = summaries.flatMap((summary) => [summary.min, summary.max, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return {
      min: min - 1,
      max: max + 1,
    };
  }

  return { min, max };
}

function positionFor(value: number, scaleMin: number, scaleMax: number): number {
  return ((value - scaleMin) / (scaleMax - scaleMin)) * 100;
}

function PlotColumn({
  label,
  selectedCount,
  summary,
  scaleMin,
  scaleMax,
  variant,
}: {
  label: string;
  selectedCount: number;
  summary: PredictionSummary;
  scaleMin: number;
  scaleMax: number;
  variant: "box" | "bar";
}) {
  const minPosition = positionFor(summary.min, scaleMin, scaleMax);
  const maxPosition = positionFor(summary.max, scaleMin, scaleMax);
  const lowerQuartilePosition = positionFor(summary.lowerQuartile, scaleMin, scaleMax);
  const upperQuartilePosition = positionFor(summary.upperQuartile, scaleMin, scaleMax);
  const meanPosition = positionFor(summary.mean, scaleMin, scaleMax);
  const zeroPosition = positionFor(0, scaleMin, scaleMax);
  const barBottom = Math.min(zeroPosition, meanPosition);
  const barHeight = Math.max(Math.abs(meanPosition - zeroPosition), 1.4);

  return (
    <article className={`${styles.plotColumn} ${variant === "bar" ? styles.plotColumnCustom : ""}`}>
      <div className={styles.plotArea} aria-hidden="true">
        {variant === "box" ? (
          <>
            <span
              className={styles.whisker}
              style={
                {
                  "--bottom": `${minPosition}%`,
                  "--height": `${Math.max(maxPosition - minPosition, 1)}%`,
                } as CSSProperties
              }
            />
            <span className={styles.whiskerCap} style={{ "--bottom": `${minPosition}%` } as CSSProperties} />
            <span className={styles.whiskerCap} style={{ "--bottom": `${maxPosition}%` } as CSSProperties} />
            <span
              className={styles.quartileBox}
              style={
                {
                  "--bottom": `${lowerQuartilePosition}%`,
                  "--height": `${Math.max(upperQuartilePosition - lowerQuartilePosition, 1.4)}%`,
                } as CSSProperties
              }
            />
            <span className={styles.meanMarker} style={{ "--bottom": `${meanPosition}%` } as CSSProperties} />
          </>
        ) : (
          <>
            <span className={styles.zeroLine} style={{ "--bottom": `${zeroPosition}%` } as CSSProperties} />
            <span
              className={styles.customBar}
              style={
                {
                  "--bottom": `${barBottom}%`,
                  "--height": `${barHeight}%`,
                } as CSSProperties
              }
            />
            <span className={styles.meanMarker} style={{ "--bottom": `${meanPosition}%` } as CSSProperties} />
          </>
        )}
      </div>
      <div className={styles.plotCaption}>
        <strong>{label}</strong>
        <span>{selectedCount} assets</span>
        <span>{formatMetric(summary.mean)}</span>
      </div>
    </article>
  );
}

export function FrankenstienerClient({ secret, initialSnapshot }: FrankenstienerClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selection, setSelection] = useState<Selection>(() => buildDefaultSelection(initialSnapshot));
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const candidatesById = useMemo(() => {
    const candidates = new Map<string, FrankenstienerCandidate>();

    for (const family of snapshot.families) {
      for (const product of family.products) {
        for (const candidate of product.candidates) {
          candidates.set(candidate.id, candidate);
        }
      }
    }

    return candidates;
  }, [snapshot.families]);

  useEffect(() => {
    setSelection((current) => {
      const nextSelection: Selection = {};

      for (const [product, candidateId] of Object.entries(current) as Array<[ProductKey, string]>) {
        if (candidatesById.has(candidateId)) {
          nextSelection[product] = candidateId;
        }
      }

      return nextSelection;
    });
  }, [candidatesById]);

  const selectedRows = useMemo(() => {
    return snapshot.families.flatMap((family) =>
      family.products.flatMap((product) => {
        const candidateId = selection[product.product];
        const candidate = candidateId ? candidatesById.get(candidateId) : null;

        return candidate
          ? [
              {
                asset: product.product,
                label: product.label,
                candidate,
              },
            ]
          : [];
      }),
    );
  }, [candidatesById, selection, snapshot.families]);

  const customSummary = useMemo(
    () => sumSummaries(selectedRows.map((row) => row.candidate)),
    [selectedRows],
  );

  const scaleBounds = useMemo(
    () => getScaleBounds([...snapshot.presets.map((preset) => preset.summary), customSummary]),
    [customSummary, snapshot.presets],
  );

  async function refreshSnapshot() {
    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch(`/r/${secret}/api/frankenstiener`, { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Could not refresh Frankenstiener data.");
      }

      const nextSnapshot = (await response.json()) as FrankenstienerSnapshot;
      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh Frankenstiener data.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function applyPreset(preset: FrankenstienerPreset) {
    setSelection(preset.selection);
  }

  function updateProductSelection(product: ProductKey, candidateId: string) {
    setSelection((current) => {
      const nextSelection = { ...current };

      if (!candidateId) {
        delete nextSelection[product];
      } else {
        nextSelection[product] = candidateId;
      }

      return nextSelection;
    });
  }

  return (
    <div className={styles.frankenstiener}>
      <section className={styles.heroPanel}>
        <div>
          <p className={styles.kicker}>Strategy Lab</p>
          <h1 className={styles.title}>Frankenstiener</h1>
        </div>
        <div className={styles.heroMetrics}>
          <div>
            <span>Selected</span>
            <strong>{selectedRows.length}</strong>
          </div>
          <div>
            <span>Projected Mean</span>
            <strong>{formatMetric(customSummary.mean)}</strong>
          </div>
          <div>
            <span>Projected Range</span>
            <strong>
              {formatMetric(customSummary.min)} to {formatMetric(customSummary.max)}
            </strong>
          </div>
        </div>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <section className={styles.chartPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Prediction Summary</p>
            <h2 className={styles.panelTitle}>Pre-builts vs blueprint</h2>
          </div>
          <div className={styles.actionRow}>
            <button className={styles.ghostButton} disabled={isRefreshing} onClick={() => void refreshSnapshot()} type="button">
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
            <button
              className={styles.primaryButton}
              disabled={selectedRows.length === 0}
              onClick={() =>
                downloadBlueprint(
                  selectedRows.map((row) => ({
                    asset: row.asset,
                    strategy: row.candidate.strategyName,
                  })),
                )
              }
              type="button"
            >
              Download blueprint
            </button>
          </div>
        </div>

        <div className={styles.presetButtons}>
          {snapshot.presets.map((preset) => (
            <button
              className={styles.presetButton}
              key={preset.key}
              onClick={() => applyPreset(preset)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className={styles.plotGrid}>
          {snapshot.presets.map((preset) => (
            <PlotColumn
              key={preset.key}
              label={preset.label}
              scaleMax={scaleBounds.max}
              scaleMin={scaleBounds.min}
              selectedCount={preset.selectedCount}
              summary={preset.summary}
              variant="box"
            />
          ))}
          <PlotColumn
            label="frankenstein"
            scaleMax={scaleBounds.max}
            scaleMin={scaleBounds.min}
            selectedCount={selectedRows.length}
            summary={customSummary}
            variant="bar"
          />
        </div>
      </section>

      <section className={styles.selectorPanel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Blueprint</p>
            <h2 className={styles.panelTitle}>Asset strategy picks</h2>
          </div>
        </div>

        <div className={styles.familyList}>
          {snapshot.families.map((family) => (
            <section
              className={styles.familySection}
              key={family.key}
              style={{ "--family-color": family.color } as CSSProperties}
            >
              <header className={styles.familyHeader}>
                <p className={styles.familyKey}>{family.key}</p>
                <h3>{family.title}</h3>
              </header>
              <div className={styles.productGrid}>
                {family.products.map((product) => {
                  const candidateId = selection[product.product] ?? "";
                  const selectedCandidate = candidateId ? candidatesById.get(candidateId) : null;

                  return (
                    <label className={styles.productPicker} key={product.product}>
                      <span className={styles.productName}>{product.label}</span>
                      <select
                        disabled={product.candidates.length === 0}
                        onChange={(event) => updateProductSelection(product.product, event.target.value)}
                        value={candidateId}
                      >
                        <option value="">No strategy</option>
                        {product.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.strategyName} | total {formatMetric(candidate.totalPnl)} | mean{" "}
                            {formatMetric(candidate.meanPnl)} | range {formatMetric(candidate.pnlRange)}
                          </option>
                        ))}
                      </select>
                      <span className={styles.productMeta}>
                        {selectedCandidate
                          ? `D2 ${formatMetric(selectedCandidate.day2Pnl)} / D3 ${formatMetric(
                              selectedCandidate.day3Pnl,
                            )} / D4 ${formatMetric(selectedCandidate.day4Pnl)}`
                          : "Unselected"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
