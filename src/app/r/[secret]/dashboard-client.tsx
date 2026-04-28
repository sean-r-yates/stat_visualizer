"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import type { DashboardSnapshot, ProductCellSnapshot } from "@/lib/dashboard-types";
import { formatMetric } from "@/lib/dashboard-types";

import styles from "./dashboard.module.css";

type DashboardClientProps = {
  secret: string;
  initialSnapshot: DashboardSnapshot;
};

type UploadState = {
  isDragging: boolean;
  isUploading: boolean;
  isClearing: boolean;
  error: string | null;
};

function metricText(value: number | null): string {
  return value === null ? "No attempt" : formatMetric(value);
}

function eventLabel(eventType: string): string {
  return eventType.toUpperCase();
}

export function DashboardClient({ secret, initialSnapshot }: DashboardClientProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [uploadState, setUploadState] = useState<UploadState>({
    isDragging: false,
    isUploading: false,
    isClearing: false,
    error: null,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = `/r/${secret}/api`;
  const downloadBase = `/r/${secret}/api/uploads`;

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
        isDragging: false,
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(product: ProductCellSnapshot) {
    if (!product.uploadId || !product.fileName) {
      return;
    }

    const confirmationMessage =
      product.winCount > 1
        ? `${product.fileName} currently wins ${product.winCount} products. Delete it anyway?`
        : `Delete ${product.fileName}?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      const response = await fetch(`${apiBase}/uploads/${product.uploadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Delete failed.");
      }

      await refreshAfterMutation();
    } catch (error) {
      setUploadState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Delete failed.",
      }));
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

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Round 5 Control Surface</p>
          <h1 className={styles.heroTitle}>Backtest every upload, rank every product, keep only the current winners.</h1>
          <p className={styles.heroText}>
            Drag Python traders into the queue and the board will update as each run moves through uploaded,
            queued, running, completed, or failed.
          </p>
        </div>

        <div className={styles.statusPanel}>
          <div className={styles.statusHeader}>
            <span className={styles.statusLabel}>Algorithm Status</span>
            <strong className={styles.statusValue}>{snapshot.activeJobs > 0 ? "Busy" : "Idle"}</strong>
          </div>
          <dl className={styles.statusGrid}>
            <div>
              <dt>Queued</dt>
              <dd>{snapshot.statusCounts.queued ?? 0}</dd>
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

          <div className={styles.topProducts}>
            <span className={styles.topProductsLabel}>Top Current Winners</span>
            {topProducts.length > 0 ? (
              topProducts.map((product) => (
                <div key={product.product} className={styles.topProductRow}>
                  <span>{product.label}</span>
                  <strong>{metricText(product.totalPnl)}</strong>
                </div>
              ))
            ) : (
              <p className={styles.topProductsEmpty}>No attempts yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.uploadStrip}>
        <div
          className={`${styles.dropzone} ${uploadState.isDragging ? styles.dropzoneActive : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setUploadState((current) => ({ ...current, isDragging: true }));
          }}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
              return;
            }
            setUploadState((current) => ({ ...current, isDragging: false }));
          }}
          onDrop={(event) => {
            event.preventDefault();
            void submitFiles(event.dataTransfer.files);
          }}
        >
          <div>
            <span className={styles.dropzoneLabel}>Upload traders</span>
            <p className={styles.dropzoneText}>
              Drop one or many <code>.py</code> files here. Each file becomes its own queued backtest job.
            </p>
          </div>

          <div className={styles.dropzoneActions}>
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
        </div>

        <div className={styles.expectedProfitCard}>
          <span className={styles.expectedProfitLabel}>Expected Profit</span>
          <strong className={styles.expectedProfitValue}>{formatMetric(snapshot.expectedProfit)}</strong>
          <div className={styles.summaryList}>
            {snapshot.summaryLines.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </div>
        </div>
      </section>

      {uploadState.error ? <p className={styles.errorBanner}>{uploadState.error}</p> : null}

      <section className={styles.gridSection}>
        {snapshot.families.map((family) => (
          <article key={family.key} className={styles.familySection}>
            <header className={styles.familyHeader}>
              <div className={styles.familyTitleGroup}>
                <span className={styles.familyAccent} style={{ backgroundColor: family.color }} />
                <div>
                  <p className={styles.familyKey}>{family.key}</p>
                  <h2 className={styles.familyTitle}>{family.title}</h2>
                </div>
              </div>
            </header>

            <div className={styles.familyGrid}>
              {family.products.map((product) => (
                <section key={product.product} className={styles.productCard}>
                  <div className={styles.productCardHeader}>
                    <span className={styles.productCode}>{product.product}</span>
                    <strong className={styles.productLabel}>{product.label}</strong>
                  </div>

                  <dl className={styles.metricList}>
                    <div>
                      <dt>Total PnL</dt>
                      <dd>{metricText(product.totalPnl)}</dd>
                    </div>
                    <div>
                      <dt>Mean</dt>
                      <dd>{metricText(product.meanPnl)}</dd>
                    </div>
                    <div>
                      <dt>Range</dt>
                      <dd>{metricText(product.pnlRange)}</dd>
                    </div>
                    <div>
                      <dt>File</dt>
                      <dd>{product.fileName ?? "No attempt"}</dd>
                    </div>
                  </dl>

                  {product.uploadId ? (
                    <div className={styles.cardActions}>
                      <a
                        className={styles.secondaryButton}
                        href={`${downloadBase}/${product.uploadId}/download`}
                      >
                        Download
                      </a>
                      <button
                        className={styles.ghostButton}
                        onClick={() => void handleDelete(product)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </article>
        ))}
      </section>

      {snapshot.terminalEvents.length > 0 ? (
        <section className={styles.terminalSection}>
          <div className={styles.terminalHeader}>
            <div>
              <p className={styles.terminalKicker}>Execution Log</p>
              <h2 className={styles.terminalTitle}>Queue Terminal</h2>
            </div>
            <button
              className={styles.ghostButton}
              disabled={uploadState.isClearing}
              onClick={() => void handleClearTerminal()}
              type="button"
            >
              {uploadState.isClearing ? "Clearing..." : "Clear"}
            </button>
          </div>
          <div className={styles.terminalBody}>
            {snapshot.terminalEvents.map((event) => (
              <div key={event.id} className={styles.terminalLine}>
                <span className={styles.terminalTag}>{eventLabel(event.eventType)}</span>
                <code>{event.message}</code>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
