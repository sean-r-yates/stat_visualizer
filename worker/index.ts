import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { Worker } from "bullmq";

import { parseBacktesterOutput } from "@/lib/backtester-parser";
import { ensureSchema } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { BACKTEST_QUEUE, getRedisConnection, type BacktestJobData } from "@/lib/queue";
import { appendTerminalEvent } from "@/lib/terminal";
import { markUploadRunning } from "@/lib/uploads";
import { finalizeFailedUpload, finalizeSuccessfulUpload } from "@/lib/winners";

class BacktestCommandError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
  }
}

function buildBacktestCommand(filePath: string): string {
  const env = getServerEnv();

  if (!env.BACKTEST_COMMAND) {
    throw new Error("BACKTEST_COMMAND is not configured.");
  }

  if (!env.BACKTEST_COMMAND.includes("{file}")) {
    throw new Error("BACKTEST_COMMAND must include a {file} placeholder.");
  }

  return env.BACKTEST_COMMAND.replaceAll("{file}", `"${filePath}"`);
}

async function runBacktester(filePath: string): Promise<{ stdout: string; stderr: string }> {
  const env = getServerEnv();
  const command = buildBacktestCommand(filePath);

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: env.BACKTEST_WORKDIR || process.cwd(),
      env: process.env,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new BacktestCommandError(
            `Backtester exited with code ${code ?? "unknown"}.`,
            stdout,
            stderr,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function processUpload(uploadId: string): Promise<void> {
  const upload = await markUploadRunning(uploadId);
  if (!upload) {
    return;
  }

  await appendTerminalEvent({
    eventType: "running",
    message: `Running ${upload.storedName}`,
    uploadId,
    storedName: upload.storedName,
  });

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "stat-visualizer-"));
  const tempFilePath = path.join(tempDirectory, upload.storedName);
  let capturedLogOutput = "";

  try {
    await writeFile(tempFilePath, upload.sourceCode, "utf8");

    const { stdout, stderr } = await runBacktester(tempFilePath);
    capturedLogOutput = [stdout, stderr].filter(Boolean).join("\n");
    const parsedMetrics = parseBacktesterOutput(stdout || capturedLogOutput);

    await finalizeSuccessfulUpload({
      uploadId,
      rawLog: capturedLogOutput,
      metrics: parsedMetrics,
    });

    await appendTerminalEvent({
      eventType: "completed",
      message: `Completed ${upload.storedName}`,
      uploadId,
      storedName: upload.storedName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backtester execution failed.";
    const commandLog =
      error instanceof BacktestCommandError
        ? [error.stdout, error.stderr].filter(Boolean).join("\n")
        : capturedLogOutput;
    const errorLog = commandLog || message;

    await finalizeFailedUpload({
      uploadId,
      rawLog: errorLog,
      errorLog,
    });

    await appendTerminalEvent({
      eventType: "failed",
      message: `Failed ${upload.storedName}: ${message}${errorLog ? `\n${errorLog}` : ""}`,
      uploadId,
      storedName: upload.storedName,
    });

    throw error;
  } finally {
    await rm(tempDirectory, { force: true, recursive: true });
  }
}

async function main() {
  await ensureSchema();

  const worker = new Worker<BacktestJobData>(
    BACKTEST_QUEUE,
    async (job) => {
      await processUpload(job.data.uploadId);
    },
    {
      concurrency: 1,
      connection: getRedisConnection(),
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] completed ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] failed ${job?.id ?? "unknown"}: ${error.message}`);
  });

  console.log("[worker] listening for Round 5 backtests");
}

void main().catch((error) => {
  console.error("[worker] startup failed", error);
  process.exit(1);
});
