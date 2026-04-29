"use client";

import type { CSSProperties } from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { formatMetric } from "@/lib/dashboard-types";
import type {
  FrankenstienerCandidate,
  FrankenstienerPreset,
  FrankenstienerSnapshot,
  PredictionSummary,
} from "@/lib/frankenstiener-types";
import type { ProductKey } from "@/lib/products";
import type { PlotlyConfig, PlotlyData, PlotlyLayout } from "plotly.js-dist-min";

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

function buildHoverText(label: string, selectedCount: number, summary: PredictionSummary): string {
  return [
    `<b>${label}</b>`,
    `${selectedCount} assets`,
    `Min: ${formatMetric(summary.min)}`,
    `Q1: ${formatMetric(summary.lowerQuartile)}`,
    `Mean: ${formatMetric(summary.mean)}`,
    `Q3: ${formatMetric(summary.upperQuartile)}`,
    `Max: ${formatMetric(summary.max)}`,
  ].join("<br>");
}

function FrankenstienerPlot({
  customSummary,
  presets,
  selectedCount,
}: {
  customSummary: PredictionSummary;
  presets: FrankenstienerPreset[];
  selectedCount: number;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [plotError, setPlotError] = useState<string | null>(null);

  const plotData = useMemo<PlotlyData[]>(() => {
    const presetBoxes = presets.map<PlotlyData>((preset) => ({
      type: "box",
      name: preset.label,
      x: [preset.label],
      q1: [preset.summary.lowerQuartile],
      median: [preset.summary.mean],
      q3: [preset.summary.upperQuartile],
      lowerfence: [preset.summary.min],
      upperfence: [preset.summary.max],
      mean: [preset.summary.mean],
      boxpoints: false,
      fillcolor: "rgba(255, 159, 67, 0.22)",
      line: {
        color: "rgba(255, 177, 85, 0.95)",
        width: 2,
      },
      marker: {
        color: "rgba(255, 177, 85, 0.95)",
      },
      hoverinfo: "text",
      hovertext: [buildHoverText(preset.label, preset.selectedCount, preset.summary)],
    }));

    return [
      ...presetBoxes,
      {
        type: "box",
        name: "frankenstein",
        x: ["frankenstein"],
        q1: [customSummary.lowerQuartile],
        median: [customSummary.mean],
        q3: [customSummary.upperQuartile],
        lowerfence: [customSummary.min],
        upperfence: [customSummary.max],
        mean: [customSummary.mean],
        boxpoints: false,
        fillcolor: "rgba(78, 205, 196, 0.32)",
        line: {
          color: "rgba(78, 205, 196, 0.98)",
          width: 2,
        },
        marker: {
          color: "rgba(78, 205, 196, 0.98)",
        },
        hoverinfo: "text",
        hovertext: [buildHoverText("frankenstein", selectedCount, customSummary)],
      },
    ];
  }, [customSummary, presets, selectedCount]);

  const plotLayout = useMemo<PlotlyLayout>(
    () => ({
      autosize: true,
      boxgap: 0.42,
      boxmode: "overlay",
      dragmode: false,
      font: {
        color: "#edf6ff",
        family: '"Trebuchet MS", "Gill Sans", "Segoe UI", sans-serif',
        size: 12,
      },
      hoverlabel: {
        bgcolor: "#06131d",
        bordercolor: "rgba(143, 176, 199, 0.35)",
        font: {
          color: "#edf6ff",
        },
      },
      margin: {
        b: 80,
        l: 74,
        r: 18,
        t: 18,
      },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(2, 11, 18, 0.72)",
      showlegend: false,
      xaxis: {
        automargin: true,
        color: "#edf6ff",
        fixedrange: true,
        gridcolor: "rgba(143, 176, 199, 0.08)",
        linecolor: "rgba(143, 176, 199, 0.26)",
        tickangle: -18,
        tickfont: {
          color: "#edf6ff",
          size: 11,
        },
        title: "",
        zeroline: false,
      },
      yaxis: {
        automargin: true,
        color: "#edf6ff",
        fixedrange: true,
        gridcolor: "rgba(143, 176, 199, 0.14)",
        linecolor: "rgba(143, 176, 199, 0.26)",
        tickformat: ",.0f",
        title: {
          text: "Projected PnL",
          font: {
            color: "#8fb0c7",
            size: 12,
          },
        },
        zeroline: true,
        zerolinecolor: "rgba(237, 246, 255, 0.34)",
        zerolinewidth: 1,
      },
    }),
    [],
  );

  const plotConfig = useMemo<PlotlyConfig>(
    () => ({
      displayModeBar: false,
      responsive: true,
      scrollZoom: false,
    }),
    [],
  );

  useEffect(() => {
    let isCancelled = false;
    const plotNode = plotRef.current;

    if (!plotNode) {
      return undefined;
    }

    void import("plotly.js-dist-min")
      .then((plotlyModule) => {
        if (isCancelled) {
          return undefined;
        }

        setPlotError(null);
        return plotlyModule.default.react(plotNode, plotData, plotLayout, plotConfig);
      })
      .catch(() => {
        if (!isCancelled) {
          setPlotError("Could not render Plotly chart.");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [plotConfig, plotData, plotLayout]);

  useEffect(() => {
    const plotNode = plotRef.current;

    return () => {
      if (!plotNode) {
        return;
      }

      void import("plotly.js-dist-min").then((plotlyModule) => {
        plotlyModule.default.purge(plotNode);
      });
    };
  }, []);

  return (
    <div className={styles.plotlyFrame}>
      {plotError ? <p className={styles.plotError}>{plotError}</p> : null}
      <div className={styles.plotlyChart} ref={plotRef} />
    </div>
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

        <FrankenstienerPlot
          customSummary={customSummary}
          presets={snapshot.presets}
          selectedCount={selectedRows.length}
        />
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
