import { NextResponse } from "next/server";

import { scheduleUploadProcessing } from "@/lib/backtest-processor";
import { ensureSecretRoute } from "@/lib/secret-route";
import { appendTerminalEvent } from "@/lib/terminal";
import { createUploadedUploads } from "@/lib/uploads";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { secret } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }

  const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith(".py"));
  if (invalidFile) {
    return NextResponse.json({ error: "Only .py files are allowed." }, { status: 400 });
  }

  const sourceFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      sourceCode: Buffer.from(await file.arrayBuffer()).toString("utf8"),
    })),
  );

  const uploads = await createUploadedUploads(sourceFiles);

  for (const upload of uploads) {
    await appendTerminalEvent({
      eventType: "uploaded",
      message: `Uploaded ${upload.storedName}`,
      uploadId: upload.id,
      storedName: upload.storedName,
    });
  }

  scheduleUploadProcessing(uploads.map((upload) => upload.id));

  return NextResponse.json({ uploaded: uploads.length });
}
