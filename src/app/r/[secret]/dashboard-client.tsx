"use client";

import type { CSSProperties } from "react";
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import type { DashboardSnapshot } from "@/lib/dashboard-types";
import { formatMetric } from "@/lib/dashboard-types";

import styles from "./dashboard.module.css";

type DashboardClientProps = {
  secret: string;
  initialSnapshot: DashboardSnapshot;
};

type UploadState = {
  isUploading: boolean;
  isClearing: boolean;
  isExporting: boolean;
  isTruncating: boolean;
  error: string | null;
};

function parseDownloadFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    return decodeURIComponent(utf8Match[1]);
  }

  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (asciiMatch) {
    return asciiMatch[1];
  }

  return null;
}

function metricText(value: number | null): string {
  return value === null ? "No attempt" : formatMetric(value);
}

function eventLabel(eventType: string): string {
  return eventType.toUpperCase();
}

function productPnlBounds(dayPnls: Array<number | null>): [number, number] {
  const values = dayPnls.filter((value): value is number => value !== null);

  if (values.length === 0) {
    return [0, 0];
  }

  return [Math.min(...values), Math.max(...values)];
}

function productTone(
  day2Pnl: number | null,
  day3Pnl: number | null,
  day4Pnl: number | null,
  meanPnl: number | null,
  pnlRange: number | null,
): "gold" | "positive" | "negative" | "neutral" {
  if (day2Pnl === null || day3Pnl === null || day4Pnl === null || meanPnl === null || pnlRange === null) {
    return "neutral";
  }

  if (day2Pnl < 0 || day3Pnl < 0 || day4Pnl < 0) {
    return "negative";
  }

  if (day2Pnl > 0 && day3Pnl > 0 && day4Pnl > 0) {
    return pnlRange < meanPnl ? "gold" : "positive";
  }

  return "neutral";
}

export function DashboardClient({ secret, initialSnapshot }: DashboardClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    isClearing: false,
    isExporting: false,
    isTruncating: false,
    error: null,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = `/r/${secret}/api`;

  const loadSnapshot = useEffectEvent(async () => {
    const response = await fetch(`${apiBase}/snapshot`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Could not refresh dashboard state.");
    }

    const nextSnapshot = (await response.json()) as DashboardSnapshot;
    startTransition(() => {
      setSnapshot(nextSnapshot);
    });
  });

  useEffect(() => {
    if (snapshot.activeJobs === 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadSnapshot().catch((error: unknown) => {
        setUploadState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Polling failed.",
        }));
      });
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadSnapshot, snapshot.activeJobs]);

  const topProducts = useMemo(
    () =>
      snapshot.families
        .flatMap((family) => family.products)
        .filter((product) => product.totalPnl !== null)
        .sort((left, right) => (right.totalPnl ?? 0) - (left.totalPnl ?? 0))
        .slice(0, 4),
    [snapshot.families],
  );

  const roundExpectedPnl = useMemo(
    () =>
      snapshot.families
        .flatMap((family) => family.products)
        .reduce((sum, product) => sum + (product.meanPnl ?? 0), 0),
    [snapshot.families],
  );

  const roundExpectedPnlInterval = useMemo(() => {
    return snapshot.families
      .flatMap((family) => family.products)
      .reduce(
        (bounds, product) => {
          const [lowerBound, upperBound] = productPnlBounds([
            product.day2Pnl,
            product.day3Pnl,
            product.day4Pnl,
          ]);

          return {
            lower: bounds.lower + lowerBound,
            upper: bounds.upper + upperBound,
          };
        },
        { lower: 0, upper: 0 },
      );
  }, [snapshot.families]);

  async function refreshAfterMutation() {
    await loadSnapshot();
    setUploadState((current) => ({
      ...current,
      error: null,
    }));
  }

  async function submitFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".py"));

    if (files.length === 0) {
      setUploadState((current) => ({
        ...current,
        error: "Only .py files can be uploaded.",
      }));
      return;
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    setUploadState((current) => ({
      ...current,
      isUploading: true,
      error: null,
    }));

    try {
      const response = await fetch(`${apiBase}/uploads`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Upload failed.");
      }

      await refreshAfterMutation();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Upload failed.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isUploading: false,
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleClearTerminal() {
    setUploadState((current) => ({
      ...current,
      isClearing: true,
      error: null,
    }));

    try {
      const response = await fetch(`${apiBase}/terminal/clear`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not clear the terminal.");
      }

      await refreshAfterMutation();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not clear the terminal.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isClearing: false,
      }));
    }
  }

  async function handleTruncateDatabase() {
    const pin = window.prompt("Enter PIN to truncate every database table.");
    if (pin === null) {
      return;
    }

    setUploadState((current) => ({
      ...current,
      isTruncating: true,
      error: null,
    }));

    try {
      const response = await fetch(`${apiBase}/db/truncate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not truncate the database.");
      }

      await refreshAfterMutation();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not truncate the database.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isTruncating: false,
      }));
    }
  }

  async function handleZipBomb() {
    setUploadState((current) => ({
      ...current,
      isExporting: true,
      error: null,
    }));

    try {
      const response = await fetch(`${apiBase}/db/export`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not export the database.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const fileName =
        parseDownloadFilename(response.headers.get("content-disposition")) ?? "stat-visualizer-db.zip";

      anchor.href = downloadUrl;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not export the database.",
      }));
    } finally {
      setUploadState((current) => ({
        ...current,
        isExporting: false,
      }));
    }
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.statusBanner}>
        <div className={styles.bannerHeader}>
          <div className={styles.bannerHeaderGroup}>
            <div className={styles.bannerStatus}>
              <span className={styles.statusLabel}>Algorithm Status</span>
              <strong className={styles.statusValue}>{snapshot.activeJobs > 0 ? "Busy" : "Idle"}</strong>
            </div>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept=".py"
              multiple
              onChange={(event) => {
                if (event.target.files) {
                  void submitFiles(event.target.files);
                }
              }}
            />
            <button
              className={styles.primaryButton}
              disabled={uploadState.isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploadState.isUploading ? "Uploading..." : "Upload .py Files"}
            </button>
          </div>
          <p className={styles.bannerText}>
            Expected PnL for round 5: {formatMetric(roundExpectedPnl)} [
            {formatMetric(roundExpectedPnlInterval.lower)}, {formatMetric(roundExpectedPnlInterval.upper)}]
          </p>
        </div>
        <dl className={styles.bannerMetrics}>
          <div>
            <dt>Uploaded</dt>
            <dd>{snapshot.statusCounts.uploaded ?? 0}</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd>{snapshot.statusCounts.running ?? 0}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{snapshot.statusCounts.completed ?? 0}</dd>
          </div>
          <div>
            <dt>Failed</dt>
            <dd>{snapshot.statusCounts.failed ?? 0}</dd>
          </div>
        </dl>

        <div className={styles.bannerWinners}>
          <span className={styles.topProductsLabel}>Top Current Winners</span>
          {topProducts.length > 0 ? (
            <div className={styles.topProductsRail}>
              {topProducts.map((product) => (
                <div key={product.product} className={styles.topProductRow}>
                  <span>{product.label}</span>
                  <strong>{metricText(product.totalPnl)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.topProductsEmpty}>No attempts yet.</p>
          )}
        </div>
      </section>

      {uploadState.error ? <p className={styles.errorBanner}>{uploadState.error}</p> : null}

      <section className={styles.gridSection}>
        {snapshot.families.map((family) => (
          <article
            key={family.key}
            className={styles.familySection}
            style={{ "--family-color": family.color } as CSSProperties}
          >
            <header className={styles.familyHeader}>
              <div className={styles.familyTitleGroup}>
                <div>
                  <p className={styles.familyKey}>{family.key}</p>
                  <h2 className={styles.familyTitle}>{family.title}</h2>
                </div>
              </div>
            </header>

            <div className={styles.familyGrid}>
              {family.products.map((product) => {
                const tone = productTone(
                  product.day2Pnl,
                  product.day3Pnl,
                  product.day4Pnl,
                  product.meanPnl,
                  product.pnlRange,
                );

                return (
                  <section
                    key={product.product}
                    className={`${styles.productCard} ${
                      tone === "gold"
                        ? styles.productCardGold
                        : tone === "positive"
                        ? styles.productCardPositive
                        : tone === "negative"
                          ? styles.productCardNegative
                          : styles.productCardNeutral
                    }`}
                  >
                    <div className={styles.productCardHeader}>
                      <strong className={styles.productLabel}>{product.label}</strong>
                    </div>

                    <dl className={styles.metricList}>
                      <div className={styles.metricSecondary}>
                        <dt>Range</dt>
                        <dd>{metricText(product.pnlRange)}</dd>
                      </div>
                      <div className={styles.metricPrimary}>
                        <dt>Mean</dt>
                        <dd>{metricText(product.meanPnl)}</dd>
                      </div>
                      <div className={styles.metricFile}>
                        <dt>File</dt>
                        <dd>{product.fileName ?? "No attempt"}</dd>
                      </div>
                    </dl>
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <section className={styles.terminalSection}>
        <div className={styles.terminalHeader}>
          <div>
            <p className={styles.terminalKicker}>Execution Log</p>
            <h2 className={styles.terminalTitle}>Backtest Terminal</h2>
          </div>
          <div className={styles.terminalActions}>
            <button
              className={styles.dangerButton}
              disabled={uploadState.isTruncating}
              onClick={() => void handleTruncateDatabase()}
              type="button"
            >
              {uploadState.isTruncating ? "Truncating..." : "DON'T FUCKING TOUCH THIS"}
            </button>
            <button
              className={styles.successButton}
              disabled={uploadState.isExporting}
              onClick={() => void handleZipBomb()}
              type="button"
            >
              {uploadState.isExporting ? "Packing..." : "ZIP BOMB"}
            </button>
            <button
              className={styles.ghostButton}
              disabled={uploadState.isClearing}
              onClick={() => void handleClearTerminal()}
              type="button"
            >
              {uploadState.isClearing ? "Clearing..." : "Clear"}
            </button>
          </div>
        </div>
        <div className={styles.terminalBody}>
          {snapshot.terminalEvents.length > 0 ? (
            snapshot.terminalEvents.map((event) => (
              <div key={event.id} className={styles.terminalLine}>
                <span className={styles.terminalTag}>{eventLabel(event.eventType)}</span>
                <code>{event.message}</code>
              </div>
            ))
          ) : (
            <p className={styles.terminalEmpty}>Terminal is clear.</p>
          )}
        </div>
      </section>
    </div>
  );
}
