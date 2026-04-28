import { NextResponse } from "next/server";

import { buildDashboardSnapshot } from "@/lib/dashboard";
import { ensureSecretRoute } from "@/lib/secret-route";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { secret } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  const snapshot = await buildDashboardSnapshot();
  return NextResponse.json(snapshot);
}
