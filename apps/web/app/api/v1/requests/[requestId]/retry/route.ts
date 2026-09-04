import { getRequestRecord, requestImmediateRetry } from "@/lib/db/requests";

export async function POST(_: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  const record = await getRequestRecord(requestId);
  if (!record) return Response.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
  if (record.status === "CALLBACK_EXECUTED") {
    return Response.json({ error: "REQUEST_ALREADY_COMPLETE" }, { status: 409 });
  }
  await requestImmediateRetry(requestId, "Permissionless manual retry requested");
  return Response.json({ ok: true, requestId });
}
