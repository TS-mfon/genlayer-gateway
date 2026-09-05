import { getRequestRecord } from "@/lib/db/requests";
import { compareIndexedAndDirect, explorerConfig, readDirectGenLayerResult } from "@/lib/explorer";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(requestId)) return Response.json({ error: "INVALID_REQUEST_ID" }, { status: 400 });
  const record = await getRequestRecord(requestId);
  if (!record) return Response.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
  const direct = await readDirectGenLayerResult(record);
  return Response.json({ request: record, direct, comparison: compareIndexedAndDirect(record, direct), config: explorerConfig() }, { headers: { "Cache-Control": "no-store" } });
}
