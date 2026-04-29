import "server-only";

import { ensureSchema, getSql } from "@/lib/db";

const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/;

export const DATABASE_WIPE_PIN = "6769";

export type TableCsvExport = {
  tableName: string;
  csv: string;
};

function quoteIdentifier(identifier: string): string {
  if (!SAFE_TABLE_NAME.test(identifier)) {
    throw new Error(`Unsafe table identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let text: string;

  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function listPublicTables(): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql<{ tablename: string }[]>`
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename asc
  `;

  return rows.map((row) => row.tablename);
}

export async function truncateAllTables(): Promise<string[]> {
  const tableNames = await listPublicTables();
  if (tableNames.length === 0) {
    return [];
  }

  const sql = getSql();
  const tableList = tableNames.map(quoteIdentifier).join(", ");

  await sql.begin(async (transaction) => {
    await transaction.unsafe(`truncate table ${tableList} restart identity cascade`);
  });

  return tableNames;
}

export async function exportAllTablesAsCsv(): Promise<TableCsvExport[]> {
  const tableNames = await listPublicTables();
  const sql = getSql();

  const exports: TableCsvExport[] = [];

  for (const tableName of tableNames) {
    const columns = await sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
      order by ordinal_position asc
    `;

    const columnNames = columns.map((column) => column.column_name);
    const rows = await sql.unsafe<Record<string, unknown>[]>(`select * from ${quoteIdentifier(tableName)}`);

    const csvLines = [
      columnNames.map(csvEscape).join(","),
      ...rows.map((row) => columnNames.map((columnName) => csvEscape(row[columnName])).join(",")),
    ];

    exports.push({
      tableName,
      csv: `${csvLines.join("\r\n")}\r\n`,
    });
  }

  return exports;
}
