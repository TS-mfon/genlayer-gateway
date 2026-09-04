import { describe, expect, it } from "vitest";
import { canTransition, CreateRequestSchema, REQUEST_FEE_WEI } from "./index.js";

describe("protocol invariants", () => {
  it("pins the request fee", () => {
    expect(REQUEST_FEE_WEI).toBe(1_000_000_000_000_000n);
  });

  it("allows forward lifecycle transitions", () => {
    expect(canTransition("CREATED", "DISPATCHED")).toBe(true);
    expect(canTransition("FINALIZED", "RETURN_DISPATCHED")).toBe(true);
  });

  it("rejects impossible lifecycle transitions", () => {
    expect(canTransition("CREATED", "FINALIZED")).toBe(false);
    expect(canTransition("ADJUDICATING", "REQUIRES_REVIEW")).toBe(true);
    expect(canTransition("REQUIRES_REVIEW", "ADJUDICATING")).toBe(true);
    expect(canTransition("CALLBACK_EXECUTED", "CREATED")).toBe(false);
  });

  it("rejects an unversioned evidence manifest", () => {
    const parsed = CreateRequestSchema.safeParse({ evidence: { version: "2", items: [] } });
    expect(parsed.success).toBe(false);
  });

  it("accepts a bounded route identifier", () => {
    const parsed = CreateRequestSchema.safeParse({ routeId: "work-adjudicator" });
    expect(parsed.success).toBe(false);
    expect(CreateRequestSchema.shape.routeId?.safeParse("work-adjudicator").success).toBe(true);
    expect(CreateRequestSchema.shape.routeId?.safeParse("../untrusted").success).toBe(false);
  });
});
