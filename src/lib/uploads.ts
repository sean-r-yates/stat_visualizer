import { randomUUID } from "node:crypto";

import { ensureSchema, getSql } from "@/lib/db";
import { createUniqueStoredName } from "@/lib/upload-names";

export type UploadRecord = {
  id: string;
  originalName: string;
  storedName: string;
  sourceCode: string;
};

export async function createQueuedUploads(
  files: Array<{ name: string; sourceCode: string }>,
): Promise<UploadRecord[]> {
  await ensureSchema();
  const sql = getSql();
  const existingRows = await sql<{ stored_name: string }[]>`
    select stored_name
    from uploads
  `;

  const existingNames = new Set(existingRows.map((row) => row.stored_name));
  const uploads = files.map<UploadRecord>((file) => ({
    id: randomUUID(),
    originalName: file.name,
    storedName: createUniqueStoredName(file.name, existingNames),
    sourceCode: file.sourceCode,
  }));

  await sql.begin(async (transaction) => {
    for (const upload of uploads) {
      await transaction`
        insert into uploads (id, original_name, stored_name, source_code, status)
        values (
          ${upload.id},
          ${upload.originalName},
          ${upload.storedName},
          ${upload.sourceCode},
          'queued'
        )
      `;
    }
  });

  return uploads;
}

export async function markUploadRunning(uploadId: string): Promise<{ storedName: string; sourceCode: string } | null> {
  await ensureSchema();
  const sql = getSql();

  const [upload] = await sql<{ stored_name: string; source_code: string }[]>`
    update uploads
    set status = 'running', started_at = coalesce(started_at, now())
    where id = ${uploadId} and status = 'queued'
    returning stored_name, source_code
  `;

  if (!upload) {
    return null;
  }

  return {
    storedName: upload.stored_name,
    sourceCode: upload.source_code,
  };
}

export async function getWinningUploadSource(
  uploadId: string,
): Promise<{ storedName: string; sourceCode: string } | null> {
  await ensureSchema();
  const sql = getSql();

  const [upload] = await sql<{ stored_name: string; source_code: string }[]>`
    select u.stored_name, u.source_code
    from uploads u
    where u.id = ${uploadId}
      and exists (
        select 1
        from product_winners pw
        where pw.upload_id = u.id
      )
  `;

  if (!upload) {
    return null;
  }

  return {
    storedName: upload.stored_name,
    sourceCode: upload.source_code,
  };
}
