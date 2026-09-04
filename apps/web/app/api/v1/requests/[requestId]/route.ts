import { getRequestRecord } from "@/lib/db/requests";

export async function GET(_: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  const record = await getRequestRecord(requestId);
  if (!record) return Response.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
  return Response.json(record);
}
