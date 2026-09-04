import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/routes/route";
import { GET as GET_ROUTE } from "@/app/api/v1/routes/[routeId]/route";
import { configuredRoutes, hasRelayExecutor, isRouteUsable } from "@/lib/routes";
import { publicConfig } from "@/lib/env";

const originalAddress = process.env.GENLAYER_GATEWAY_ADDRESS;
const originalRoutes = process.env.GENLAYER_ROUTES_JSON;

afterEach(() => {
  if (originalAddress === undefined) delete process.env.GENLAYER_GATEWAY_ADDRESS;
  else process.env.GENLAYER_GATEWAY_ADDRESS = originalAddress;
  if (originalRoutes === undefined) delete process.env.GENLAYER_ROUTES_JSON;
  else process.env.GENLAYER_ROUTES_JSON = originalRoutes;
});

describe("reviewed gateway routes", () => {
  it("returns no route when the adjudicator is not configured", () => {
    delete process.env.GENLAYER_GATEWAY_ADDRESS;
    expect(configuredRoutes()).toEqual([]);
  });

  it("returns the reviewed testnet adjudicator profile", () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = "0x1111111111111111111111111111111111111111";
    expect(configuredRoutes()).toEqual([
      expect.objectContaining({
        id: "gateway-adjudicator",
        originChainId: 84532,
        destinationChainId: 4221,
        destinationContract: process.env.GENLAYER_GATEWAY_ADDRESS,
        method: "adjudicate",
        resultSchema: "GatewayStoredResultV1",
        trustModel: "THRESHOLD_ATTESTORS",
        status: "ACTIVE",
      }),
    ]);
  });

  it("rejects malformed configured addresses", () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = "not-an-address";
    expect(configuredRoutes()).toEqual([]);
  });

  it("serves multiple explicitly reviewed destination profiles", () => {
    delete process.env.GENLAYER_GATEWAY_ADDRESS;
    process.env.GENLAYER_ROUTES_JSON = JSON.stringify([
      {
        id: "work-adjudicator",
        label: "Work adjudicator",
        originChainId: 84532,
        destinationChainId: 4221,
        destinationContract: "0x1111111111111111111111111111111111111111",
        method: "adjudicate",
        resultSchema: "GatewayStoredResultV1",
        argumentSchema: "GatewayAdjudicateArgsV1",
        status: "ACTIVE",
        trustModel: "THRESHOLD_ATTESTORS",
      },
      {
        id: "claims-adjudicator",
        label: "Claims adjudicator",
        originChainId: 84532,
        destinationChainId: 4221,
        destinationContract: "0x2222222222222222222222222222222222222222",
        method: "evaluate_claim",
        resultSchema: "ClaimResultV1",
        argumentSchema: "ClaimArgsV1",
        status: "PAUSED",
        trustModel: "ATTESTED_TESTNET",
      },
    ]);
    expect(configuredRoutes()).toHaveLength(2);
    expect(configuredRoutes().map((route) => route.id)).toEqual(["work-adjudicator", "claims-adjudicator"]);
  });

  it("does not expose malformed or unsupported route profiles", () => {
    delete process.env.GENLAYER_GATEWAY_ADDRESS;
    process.env.GENLAYER_ROUTES_JSON = JSON.stringify([
      {
        id: "unsupported-origin",
        label: "Unsupported",
        originChainId: 1,
        destinationChainId: 4221,
        destinationContract: "0x1111111111111111111111111111111111111111",
        method: "adjudicate",
        resultSchema: "ResultV1",
        argumentSchema: "ArgsV1",
        status: "ACTIVE",
        trustModel: "THRESHOLD_ATTESTORS",
      },
      { id: "not-a-route" },
    ]);
    expect(configuredRoutes()).toEqual([]);
  });

  it("serves only configured reviewed routes", async () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = "0x2222222222222222222222222222222222222222";
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.testnetOnly).toBe(true);
    expect(body.routes).toHaveLength(1);
    expect(body.routes[0].destinationContract).toBe(process.env.GENLAYER_GATEWAY_ADDRESS);
    expect(body.routes[0].executorReady).toBe(true);
    expect(body.note).toContain("not automatically trusted");
  });

  it("keeps the default route profile compatible with existing callers", () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = "0x2222222222222222222222222222222222222222";
    expect(configuredRoutes()[0]).toMatchObject({ id: "gateway-adjudicator", argumentSchema: "GatewayAdjudicateArgsV1" });
    expect(hasRelayExecutor(configuredRoutes()[0]!)).toBe(true);
    expect(isRouteUsable(configuredRoutes()[0]!)).toBe(true);
  });

  it("exposes the quorum forwarder as the active hub forwarder", () => {
    process.env.NEXT_PUBLIC_HUB_FORWARDER_ADDRESS = "0x3333333333333333333333333333333333333333";
    process.env.NEXT_PUBLIC_HUB_QUORUM_FORWARDER_ADDRESS = "0x4444444444444444444444444444444444444444";
    expect(publicConfig().hubForwarder).toBe(process.env.NEXT_PUBLIC_HUB_QUORUM_FORWARDER_ADDRESS);
  });

  it("returns one exact reviewed route profile", async () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = "0x2222222222222222222222222222222222222222";
    const response = await GET_ROUTE(new Request("http://localhost/api/v1/routes/gateway-adjudicator"), { params: Promise.resolve({ routeId: "gateway-adjudicator" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.route.destinationContract).toBe(process.env.GENLAYER_GATEWAY_ADDRESS);
    expect(body.route.executorReady).toBe(true);
    expect(body.usage.arbitraryDestinationExecution).toBe(false);
  });

  it("does not turn an unknown route ID into a destination call", async () => {
    delete process.env.GENLAYER_GATEWAY_ADDRESS;
    const response = await GET_ROUTE(new Request("http://localhost/api/v1/routes/not-configured"), { params: Promise.resolve({ routeId: "not-configured" }) });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("ROUTE_NOT_FOUND");
  });
});
