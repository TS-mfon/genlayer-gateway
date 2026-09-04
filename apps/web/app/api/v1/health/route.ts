import { getDatabase } from "@/lib/db/mongodb";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  const startedAt = Date.now();
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    const env = getServerEnv();
    const configuration = {
      hubRpc: Boolean(env.HUB_RPC_URL),
      genLayerRpc: Boolean(env.GENLAYER_RPC_URL),
      baseRouter: Boolean(process.env.NEXT_PUBLIC_GATEWAY_ROUTER_ADDRESS),
      hubReceiver: Boolean(env.HUB_RECEIVER_ADDRESS),
      hubForwarder: Boolean(env.HUB_FORWARDER_ADDRESS),
      attestor: Boolean(env.RESULT_ATTESTOR_PRIVATE_KEY),
    };
    const configured = Object.values(configuration).every(Boolean);
    return Response.json({
      ok: configured,
      service: "genlayer-gateway",
      database: "reachable",
      configuration,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    }, { status: configured ? 200 : 503 });
  } catch {
    return Response.json(
      { ok: false, service: "genlayer-gateway", database: "unreachable" },
      { status: 503 },
    );
  }
}
