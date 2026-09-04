import { DEFAULT_ROUTE_ID } from "@gateway/protocol";
import { z } from "zod";

export const GatewayRouteSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  label: z.string().min(1).max(120),
  originChainId: z.number().int().positive(),
  destinationChainId: z.number().int().positive(),
  destinationContract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  method: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/),
  resultSchema: z.string().min(1).max(120),
  argumentSchema: z.string().min(1).max(120),
  status: z.enum(["ACTIVE", "PAUSED"]),
  trustModel: z.enum(["ATTESTED_TESTNET", "NATIVE_FINALITY_PROOF", "THRESHOLD_ATTESTORS"]),
});
export type GatewayRoute = z.infer<typeof GatewayRouteSchema>;

export function hasRelayExecutor(route: GatewayRoute) {
  return route.id === DEFAULT_ROUTE_ID
    && route.method === "adjudicate"
    && route.argumentSchema === "GatewayAdjudicateArgsV1"
    && route.resultSchema === "GatewayStoredResultV1";
}

export function isRouteUsable(route: GatewayRoute) {
  return route.status === "ACTIVE" && hasRelayExecutor(route);
}

const RouteListSchema = z.array(GatewayRouteSchema).max(32);

export function configuredRoutes(): GatewayRoute[] {
  const configured = process.env.GENLAYER_ROUTES_JSON;
  if (configured) {
    try {
      const parsed = RouteListSchema.safeParse(JSON.parse(configured));
      if (parsed.success) {
        return parsed.data.filter(
          (route) => route.originChainId === 84532 && route.destinationChainId === 4221,
        );
      }
    } catch {
      return [];
    }
  }

  const address = process.env.GENLAYER_GATEWAY_ADDRESS;
  if (!address) return [];
  const route = {
    id: "gateway-adjudicator",
    label: "Gateway work adjudicator",
    originChainId: 84532,
    destinationChainId: 4221,
    destinationContract: address,
    method: "adjudicate",
    resultSchema: "GatewayStoredResultV1",
    argumentSchema: "GatewayAdjudicateArgsV1",
    status: "ACTIVE",
    trustModel: "THRESHOLD_ATTESTORS",
  } satisfies GatewayRoute;
  const parsed = GatewayRouteSchema.safeParse(route);
  return parsed.success ? [parsed.data] : [];
}
