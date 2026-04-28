import { Queue } from "bullmq";
import IORedis from "ioredis";

import { getServerEnv } from "@/lib/env";

export const BACKTEST_QUEUE = "round5-backtests";

export type BacktestJobData = {
  uploadId: string;
};

let connection: IORedis | null = null;
let queue: Queue<BacktestJobData> | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(getServerEnv().REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });
  }

  return connection;
}

export function getBacktestQueue(): Queue<BacktestJobData> {
  if (!queue) {
    queue = new Queue<BacktestJobData>(BACKTEST_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }

  return queue;
}
