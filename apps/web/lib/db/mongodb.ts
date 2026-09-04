import { MongoClient, type Db } from "mongodb";
import { getServerEnv } from "@/lib/env";

declare global {
  var __gatewayMongoClient: MongoClient | undefined;
}

export async function getDatabase(): Promise<Db> {
  const env = getServerEnv();
  const client = global.__gatewayMongoClient ?? new MongoClient(env.MONGODB_URI);
  if (!global.__gatewayMongoClient) {
    await client.connect();
    global.__gatewayMongoClient = client;
  }
  return client.db(env.MONGODB_DATABASE);
}

export async function ensureIndexes(): Promise<void> {
  const database = await getDatabase();
  const requests = database.collection("requests");
  await Promise.all([
    requests.createIndex({ requestId: 1 }, { unique: true }),
    requests.createIndex({ idempotencyKey: 1 }, { unique: true }),
    requests.createIndex({ status: 1, nextAttemptAt: 1 }),
    requests.createIndex({ "request.requester": 1, createdAt: -1 }),
    database.collection("nonces").createIndex({ requester: 1, nonce: 1 }, { unique: true }),
    database.collection("leases").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("webhook_events").createIndex({ deliveryId: 1 }, { unique: true }),
    database.collection("evidence").createIndex({ evidenceId: 1 }, { unique: true }),
    database.collection("evidence").createIndex({ digest: 1 }, { unique: true }),
  ]);
}
