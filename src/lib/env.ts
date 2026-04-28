import { z } from "zod";

const serverEnvSchema = z.object({
  APP_SECRET_SLUG: z.string().min(12),
  DATABASE_URL: z.string().min(1),
  BACKTEST_COMMAND: z.string().min(1).optional(),
  BACKTEST_WORKDIR: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse({
      APP_SECRET_SLUG: process.env.APP_SECRET_SLUG,
      DATABASE_URL: process.env.DATABASE_URL,
      BACKTEST_COMMAND: process.env.BACKTEST_COMMAND,
      BACKTEST_WORKDIR: process.env.BACKTEST_WORKDIR,
    });
  }

  return cachedEnv;
}

export function isSecretSlugMatch(secret: string): boolean {
  return secret === getServerEnv().APP_SECRET_SLUG;
}
