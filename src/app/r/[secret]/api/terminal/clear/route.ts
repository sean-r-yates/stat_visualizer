import { NextResponse } from "next/server";

import { ensureSecretRoute } from "@/lib/secret-route";
import { clearTerminalAndFailedJobs } from "@/lib/terminal";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  const { secret } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  await clearTerminalAndFailedJobs();
  return NextResponse.json({ cleared: true });
}
