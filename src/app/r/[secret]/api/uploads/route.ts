import { NextResponse } from "next/server";

import { getBacktestQueue } from "@/lib/queue";
import { ensureSecretRoute } from "@/lib/secret-route";
import { appendTerminalEvent } from "@/lib/terminal";
import { createQueuedUploads } from "@/lib/uploads";
import { finalizeFailedUpload } from "@/lib/winners";

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

  const uploads = await createQueuedUploads(sourceFiles);
  const queue = getBacktestQueue();

  for (const upload of uploads) {
    await appendTerminalEvent({
      eventType: "uploaded",
      message: `Uploaded ${upload.storedName}`,
      uploadId: upload.id,
      storedName: upload.storedName,
    });

    await appendTerminalEvent({
      eventType: "queued",
      message: `Queued ${upload.storedName}`,
      uploadId: upload.id,
      storedName: upload.storedName,
    });

    try {
      await queue.add(
        upload.id,
        {
          uploadId: upload.id,
        },
        {
          jobId: upload.id,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Queue submission failed.";

      await finalizeFailedUpload({
        uploadId: upload.id,
        rawLog: message,
        errorLog: message,
      });

      await appendTerminalEvent({
        eventType: "failed",
        message: `Failed to queue ${upload.storedName}: ${message}`,
        uploadId: upload.id,
        storedName: upload.storedName,
      });
    }
  }

  return NextResponse.json({ uploaded: uploads.length });
}
