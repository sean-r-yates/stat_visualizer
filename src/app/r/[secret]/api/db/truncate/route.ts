import { NextResponse } from "next/server";

import { DATABASE_WIPE_PIN, truncateAllTables } from "@/lib/admin";
import { ensureSecretRoute } from "@/lib/secret-route";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

type TruncateRequestBody = {
  pin?: string;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { secret } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  let body: TruncateRequestBody;

  try {
    body = (await request.json()) as TruncateRequestBody;
  } catch {
    return NextResponse.json({ error: "Missing PIN." }, { status: 400 });
  }

  if (body.pin !== DATABASE_WIPE_PIN) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 403 });
  }

  const tables = await truncateAllTables();

  return NextResponse.json({
    truncated: true,
    tableCount: tables.length,
    tables,
  });
}
