import type { GatewayRequestRecord, GatewayResult, RequestStatus } from "@gateway/protocol";
import { assertTransition } from "@gateway/protocol";
import { getDatabase } from "./mongodb";

export async function createRequestRecord(record: GatewayRequestRecord) {
  const database = await getDatabase();
  await database.collection<GatewayRequestRecord>("requests").insertOne(record);
  return record;
}

export async function getRequestRecord(requestId: string) {
  const database = await getDatabase();
  return database.collection<GatewayRequestRecord>("requests").findOne({ requestId });
}

export async function listRequestRecords(options: {
  limit?: number;
  query?: string;
  status?: string;
  decision?: string;
} = {}) {
  const database = await getDatabase();
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const filters: Record<string, unknown>[] = [];
  if (options.query) {
    const escaped = options.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters.push({ $or: [
      { requestId: { $regex: escaped, $options: "i" } },
      { "request.transactionHash": { $regex: escaped, $options: "i" } },
      { "request.evidence.items.uri": { $regex: escaped, $options: "i" } },
      { "bridge.inboundMessageId": { $regex: escaped, $options: "i" } },
      { "bridge.genlayerTransaction": { $regex: escaped, $options: "i" } },
    ] });
  }
  if (options.status) filters.push({ status: options.status });
  if (options.decision) filters.push({ "result.decision": options.decision });
  const filter = filters.length ? { $and: filters } : {};
  return database
    .collection<GatewayRequestRecord>("requests")
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .project({ _id: 0 })
    .toArray();
}

export async function transitionRequest(
  requestId: string,
  to: RequestStatus,
  detail: string,
  metadata: { transactionHash?: string; messageId?: string } = {},
) {
  const database = await getDatabase();
  const collection = database.collection<GatewayRequestRecord>("requests");
  const current = await collection.findOne({ requestId });
  if (!current) throw new Error(`Unknown request ${requestId}`);
  if (current.status === to) return current;
  assertTransition(current.status, to);

  const now = new Date().toISOString();
  const update = await collection.updateOne(
    { requestId, status: current.status },
    {
      $set: {
        status: to,
        updatedAt: now,
      },
      $push: { lifecycle: { status: to, at: now, detail, ...metadata } },
    },
  );
  if (update.matchedCount !== 1) throw new Error(`Concurrent lifecycle update for ${requestId}`);
  return collection.findOne({ requestId });
}

export async function listReconciliationCandidates(limit = 25) {
  const database = await getDatabase();
  const now = new Date().toISOString();
  return database
    .collection<GatewayRequestRecord>("requests")
    .find({
      status: { $nin: ["CALLBACK_EXECUTED"] },
      $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }],
    })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .toArray();
}

export async function scheduleRetry(requestId: string, attempts: number, reason: string) {
  const database = await getDatabase();
  const collection = database.collection<GatewayRequestRecord>("requests");
  const current = await collection.findOne({ requestId });
  if (!current) throw new Error(`Unknown request ${requestId}`);
  const delaySeconds = Math.min(15 * 2 ** attempts, 3_600);
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1_000).toISOString();
  await collection.updateOne(
    { requestId, attempts },
    {
      $set: {
        nextAttemptAt,
        updatedAt: new Date().toISOString(),
      },
      $push: { lifecycle: { status: current.status, at: new Date().toISOString(), detail: `Retry scheduled: ${reason}` } },
      $inc: { attempts: 1 },
    },
  );
}

export async function requestImmediateRetry(requestId: string, reason: string) {
  const database = await getDatabase();
  const collection = database.collection<GatewayRequestRecord>("requests");
  const current = await collection.findOne({ requestId });
  if (!current) throw new Error(`Unknown request ${requestId}`);
  const now = new Date().toISOString();
  await collection.updateOne(
    { requestId },
    {
      $set: { updatedAt: now },
      $unset: { nextAttemptAt: "" },
      $push: { lifecycle: { status: current.status, at: now, detail: reason } },
    },
  );
}

export async function persistFinalizedResult(requestId: string, result: GatewayResult) {
  const database = await getDatabase();
  await database.collection<GatewayRequestRecord>("requests").updateOne(
    { requestId, result: { $exists: false } },
    { $set: { result, updatedAt: new Date().toISOString() } },
  );
}

export async function updateBridgeState(
  requestId: string,
  bridge: GatewayRequestRecord["bridge"],
) {
  const database = await getDatabase();
  const fields = Object.fromEntries(Object.entries(bridge ?? {}).map(([key, value]) => [`bridge.${key}`, value]));
  await database.collection<GatewayRequestRecord>("requests").updateOne(
    { requestId },
    { $set: { ...fields, updatedAt: new Date().toISOString() } },
  );
}
