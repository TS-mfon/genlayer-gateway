import { CreateRequestSchema, DEFAULT_ROUTE_ID, type GatewayRequestRecord } from "@gateway/protocol";
import { MongoServerError } from "mongodb";
import { createHash } from "node:crypto";
import { createRequestRecord } from "@/lib/db/requests";
import { ensureIndexes, getDatabase } from "@/lib/db/mongodb";
import { verifyGatewayRequestSignature } from "@/lib/protocol/signature";
import { readOnchainRequest, verifyOnchainRegistration } from "@/lib/protocol/router";
import { configuredRoutes, isRouteUsable } from "@/lib/routes";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400 });
  }
  if (new Date(parsed.data.expiry).getTime() <= Date.now()) {
    return Response.json({ error: "REQUEST_EXPIRED" }, { status: 400 });
  }
  const routeId = parsed.data.routeId ?? DEFAULT_ROUTE_ID;
  const route = configuredRoutes().find((candidate) => candidate.id === routeId && isRouteUsable(candidate));
  if (!route) {
    return Response.json({ error: "ROUTE_NOT_USABLE", routeId }, { status: 422 });
  }
  if (!(await verifyOnchainRegistration(parsed.data))) {
    return Response.json({ error: "ONCHAIN_REQUEST_MISMATCH" }, { status: 422 });
  }
  if (parsed.data.signature && !(await verifyGatewayRequestSignature(parsed.data))) {
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  await ensureIndexes();
  const onchain = await readOnchainRequest(parsed.data.requestId);
  if (!onchain) return Response.json({ error: "ONCHAIN_REQUEST_NOT_FOUND" }, { status: 422 });
  const database = await getDatabase();
  try {
    await database.collection("nonces").insertOne({
      requester: parsed.data.requester.toLowerCase(),
      nonce: parsed.data.nonce,
      requestId: parsed.data.requestId,
      createdAt: new Date(),
    });
    const now = new Date().toISOString();
    const idempotencyKey = createHash("sha256")
      .update(`${parsed.data.requester}:${parsed.data.nonce}:${parsed.data.requestId}`)
      .digest("hex");
    const record: GatewayRequestRecord = {
      requestId: parsed.data.requestId,
      idempotencyKey,
      request: { ...parsed.data, routeId },
      status: "DISPATCHED",
      lifecycle: [
        { status: "CREATED", at: now, detail: "Paid on-chain request verified" },
        { status: "DISPATCHED", at: now, detail: "Router dispatched the bridge message", transactionHash: parsed.data.transactionHash, messageId: onchain.outboundMessageId },
      ],
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    await createRequestRecord(record);
    return Response.json(record, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return Response.json({ error: "DUPLICATE_REQUEST_OR_NONCE" }, { status: 409 });
    }
    throw error;
  }
}
