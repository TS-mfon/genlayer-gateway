import { getRequestRecord } from "@/lib/db/requests";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  const record = await getRequestRecord(requestId);
  if (!record) return Response.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
  if (!record.result) {
    return Response.json({ error: "RESULT_NOT_FINALIZED", status: record.status }, { status: 409 });
  }
  return Response.json(record.result);
}
