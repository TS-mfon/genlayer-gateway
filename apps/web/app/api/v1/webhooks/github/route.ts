import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { ensureIndexes, getDatabase } from "@/lib/db/mongodb";
import { MongoServerError } from "mongodb";

export function validSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  try {
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
    const received = Buffer.from(signature.slice(7), "hex");
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return Response.json({ error: "GITHUB_WEBHOOK_DISABLED" }, { status: 503 });
  }
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return Response.json({ error: "WEBHOOK_PAYLOAD_TOO_LARGE" }, { status: 413 });
  }
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"), env.GITHUB_WEBHOOK_SECRET)) {
    return Response.json({ error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 401 });
  }
  const deliveryId = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event");
  if (!deliveryId || !event) return Response.json({ error: "MISSING_WEBHOOK_HEADERS" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  await ensureIndexes();
  const database = await getDatabase();
  try {
    await database.collection("webhook_events").insertOne({
      deliveryId,
      event,
      action: payload.action ?? null,
      repository: typeof payload.repository === "object" && payload.repository
        ? (payload.repository as { full_name?: string }).full_name ?? null
        : null,
      receivedAt: new Date(),
      processed: false,
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return Response.json({ ok: true, duplicate: true }, { status: 202 });
    }
    throw error;
  }
  return Response.json({ ok: true, accepted: true }, { status: 202 });
}
