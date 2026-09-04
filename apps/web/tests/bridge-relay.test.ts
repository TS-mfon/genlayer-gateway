import { afterEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes } from "viem";
import type { GatewayRequestRecord } from "@gateway/protocol";
import {
  decodeAndValidateHubRequest,
  encodeReturnMessage,
  parseAndValidateGenLayerResult,
  resolveRelayRoute,
} from "@/lib/services/bridge-relay";

const router = "0x4444444444444444444444444444444444444444" as const;
const requester = "0x5555555555555555555555555555555555555555" as const;
const callback = "0x6666666666666666666666666666666666666666" as const;
const genlayer = "0x7777777777777777777777777777777777777777" as const;
const requestId = `0x${"11".repeat(32)}` as `0x${string}`;
const evidenceHash = `0x${"22".repeat(32)}` as `0x${string}`;
const policy = "All mandatory checks must pass.";
const expiry = "2033-05-18T03:33:20.000Z";
const envelope = parseAbiParameters("uint8, bytes32, uint256, address, address, address, uint64, uint64, string, string, string, bytes32");
const originalGatewayAddress = process.env.GENLAYER_GATEWAY_ADDRESS;

afterEach(() => {
  if (originalGatewayAddress === undefined) delete process.env.GENLAYER_GATEWAY_ADDRESS;
  else process.env.GENLAYER_GATEWAY_ADDRESS = originalGatewayAddress;
});

function candidate(): GatewayRequestRecord {
  return {
    requestId,
    idempotencyKey: "key",
    status: "DISPATCHED",
    lifecycle: [],
    attempts: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    request: {
      requestId,
      requester,
      originChainId: 84532,
      originContract: requester,
      callback,
      question: "Did the work pass?",
      policy,
      evidence: { version: "1", items: [{ kind: "CONTENT_HASH", uri: "https://example.test/evidence", digest: evidenceHash, metadata: {} }] },
      nonce: "1",
      expiry,
      transactionHash: `0x${"33".repeat(32)}`,
    },
  };
}

function pending() {
  const record = candidate();
  return {
    sourceChainId: 84532,
    sourceSender: router,
    targetGenLayerContract: genlayer,
    relayed: false,
    data: encodeAbiParameters(envelope, [1, requestId, 84532n, router, requester, callback, 1n, 2_000_000_000n, record.request.question, policy, record.request.evidence.items[0]!.uri, evidenceHash]),
  };
}

describe("bridge relay commitment validation", () => {
  it("resolves the default route only when its executor is fully bound", () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = genlayer;
    expect(resolveRelayRoute(candidate(), genlayer)).toMatchObject({
      id: "gateway-adjudicator",
      method: "adjudicate",
      argumentSchema: "GatewayAdjudicateArgsV1",
    });
  });

  it("fails closed for a registered route without a typed relay executor", () => {
    process.env.GENLAYER_GATEWAY_ADDRESS = genlayer;
    const routed = candidate();
    routed.request.routeId = "claims-adjudicator";
    expect(() => resolveRelayRoute(routed, genlayer)).toThrow("route is not active");
  });

  it("accepts an exactly bound hub request", () => {
    expect(decodeAndValidateHubRequest(pending(), candidate(), router, genlayer).requestId).toBe(requestId);
  });

  it("rejects an untrusted hub route", () => {
    expect(() => decodeAndValidateHubRequest({ ...pending(), sourceSender: requester }, candidate(), router, genlayer)).toThrow("route mismatch");
  });

  it("rejects altered request evidence", () => {
    const altered = candidate();
    altered.request.evidence.items[0]!.digest = `0x${"99".repeat(32)}`;
    expect(() => decodeAndValidateHubRequest(pending(), altered, router, genlayer)).toThrow("commitment mismatch");
  });

  it("validates and encodes a bound GenLayer result", () => {
    const record = candidate();
    const stored = JSON.stringify({
      request_id: requestId,
      decision: "PASS",
      reason: "All checks passed.",
      evidence_hash: evidenceHash,
      policy_hash: keccak256(toBytes(policy)),
      origin_chain_id: 84532,
      origin_contract: router,
      requester,
      callback,
      nonce: 1,
      expiry: 2_000_000_000,
    });
    const result = parseAndValidateGenLayerResult(stored, record, router);
    const encoded = encodeReturnMessage(1, requestId, result, `0x${"aa".repeat(32)}`, genlayer, router, `0x${"bb".repeat(32)}`);
    expect(encoded.startsWith("0x")).toBe(true);
  });

  it("rejects a result for another request", () => {
    const stored = JSON.stringify({
      request_id: `0x${"ff".repeat(32)}`,
      decision: "PASS",
      reason: "Wrong request.",
      evidence_hash: evidenceHash,
      policy_hash: keccak256(toBytes(policy)),
      origin_chain_id: 84532,
      origin_contract: router,
      requester,
      callback,
      nonce: 1,
      expiry: 2_000_000_000,
    });
    expect(() => parseAndValidateGenLayerResult(stored, candidate(), router)).toThrow("commitment mismatch");
  });
});
