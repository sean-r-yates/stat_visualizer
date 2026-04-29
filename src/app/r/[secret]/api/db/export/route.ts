import { exportAllTablesAsCsv } from "@/lib/admin";
import { ensureSecretRoute } from "@/lib/secret-route";
import { createZipArchive } from "@/lib/zip";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

function buildArchiveName(): string {
  const isoStamp = new Date().toISOString().replaceAll(":", "-");
  return `stat-visualizer-db-${isoStamp}.zip`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { secret } = await params;
  const forbidden = ensureSecretRoute(secret);

  if (forbidden) {
    return forbidden;
  }

  const tableExports = await exportAllTablesAsCsv();
  const archive = createZipArchive(
    tableExports.map((tableExport) => ({
      name: `${tableExport.tableName}.csv`,
      content: tableExport.csv,
    })),
  );

  return new Response(archive, {
    headers: {
      "Content-Disposition": `attachment; filename="${buildArchiveName()}"`,
      "Content-Length": String(archive.byteLength),
      "Content-Type": "application/zip",
      "Cache-Control": "no-store",
    },
  });
}
