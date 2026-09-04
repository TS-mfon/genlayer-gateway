import { getDatabase } from "./mongodb";
import { MongoServerError } from "mongodb";

export async function withLease<T>(key: string, durationMs: number, work: () => Promise<T>) {
  const database = await getDatabase();
  const leases = database.collection<{ _id: string; acquiredAt: Date; expiresAt: Date }>("leases");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMs);
  try {
    await leases.insertOne({ _id: key, acquiredAt: now, expiresAt });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return null;
    throw error;
  }
  try {
    return await work();
  } finally {
    await leases.deleteOne({ _id: key });
  }
}
