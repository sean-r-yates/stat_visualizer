import { NextResponse } from "next/server";

import { ensureSecretRoute } from "@/lib/secret-route";
import { getWinningUploadSource } from "@/lib/uploads";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string; uploadId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { secret, uploadId } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  const upload = await getWinningUploadSource(uploadId);
  if (!upload) {
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }

  return new NextResponse(upload.sourceCode, {
    headers: {
      "Content-Disposition": `attachment; filename="${upload.storedName}"`,
      "Content-Type": "text/x-python; charset=utf-8",
    },
  });
}
