import { ensureSchema, getSql } from "@/lib/db";

export type TerminalEventType =
  | "uploaded"
  | "running"
  | "completed"
  | "failed"
  | "refreshed";

export async function appendTerminalEvent(input: {
  eventType: TerminalEventType;
  message: string;
  uploadId?: string | null;
  storedName?: string | null;
}): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql`
    insert into terminal_events (event_type, message, upload_id, stored_name)
    values (${input.eventType}, ${input.message}, ${input.uploadId ?? null}, ${input.storedName ?? null})
  `;
}

export async function clearTerminalAndFailedJobs(): Promise<void> {
  await ensureSchema();
  const sql = getSql();

  await sql.begin(async (transaction) => {
    await transaction`delete from terminal_events`;
    await transaction`delete from uploads where status = 'failed'`;
  });
}
