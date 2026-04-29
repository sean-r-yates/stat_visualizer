import { NextResponse } from "next/server";

import { ensureSecretRoute } from "@/lib/secret-route";
import { appendTerminalEvent } from "@/lib/terminal";
import { rebuildProductWinnersFromRunResults } from "@/lib/winners";

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

  const result = await rebuildProductWinnersFromRunResults();

  await appendTerminalEvent({
    eventType: "refreshed",
    message: `Mega refresh recalculated ${result.refreshedProducts} product winners`,
  });

  return NextResponse.json({
    refreshed: true,
    refreshedProducts: result.refreshedProducts,
  });
}
