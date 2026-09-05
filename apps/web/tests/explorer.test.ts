import { describe, expect, it } from "vitest";
import { compareIndexedAndDirect } from "@/lib/explorer";

const record = {
  requestId: "0x" + "11".repeat(32),
  result: {
    decision: "PASS",
    reason: "accepted",
    evidenceHash: "0x" + "22".repeat(32),
    policyHash: "0x" + "33".repeat(32),
    genlayerTransaction: "0x" + "44".repeat(32),
    transportMessageId: "0x" + "55".repeat(32),
    finalizedAt: new Date().toISOString(),
  },
} as any;

function directResult(decision: "PASS" | "FAIL") {
  return {
    request_id: record.requestId,
    decision,
    reason: decision === "PASS" ? "accepted" : "rejected",
    evidence_hash: record.result.evidenceHash,
    policy_hash: record.result.policyHash,
    origin_chain_id: 84532,
    origin_contract: "0x" + "77".repeat(20),
    requester: "0x" + "88".repeat(20),
    callback: "0x" + "99".repeat(20),
    nonce: 1,
    expiry: 2_000_000_000,
  };
}

describe("explorer source comparison", () => {
  it("confirms matching indexed and direct commitments", () => {
    expect(compareIndexedAndDirect(record, {
      source: "GENLAYER_DIRECT",
      contract: "0x" + "66".repeat(20),
      state: "FINALIZED",
      result: directResult("PASS"),
    })).toEqual({ comparable: true, matches: true });
  });

  it("surfaces mismatched decisions", () => {
    expect(compareIndexedAndDirect(record, {
      source: "GENLAYER_DIRECT",
      contract: "0x" + "66".repeat(20),
      state: "FINALIZED",
      result: directResult("FAIL"),
    })).toEqual({ comparable: true, matches: false });
  });

  it("does not compare absent results", () => {
    expect(compareIndexedAndDirect({ ...record, result: undefined }, {
      source: "GENLAYER_DIRECT",
      contract: "0x" + "66".repeat(20),
      state: "NO_RESULT",
    })).toEqual({ comparable: false, matches: null });
  });
});
