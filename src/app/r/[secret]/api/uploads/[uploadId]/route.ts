import { NextResponse } from "next/server";

import { ensureSecretRoute } from "@/lib/secret-route";
import { deleteWinningUpload } from "@/lib/winners";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string; uploadId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { secret, uploadId } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  const deletedProductCount = await deleteWinningUpload(uploadId);
  if (deletedProductCount === 0) {
    return NextResponse.json({ error: "Winning upload not found." }, { status: 404 });
  }

  return NextResponse.json({ deletedProductCount });
}
