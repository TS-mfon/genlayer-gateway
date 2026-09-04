import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validSignature } from "@/app/api/v1/webhooks/github/route";
import { isAuthorizedReconcile } from "@/app/api/v1/reconcile/route";

it("accepts only valid GitHub HMAC signatures", () => {
  const body = JSON.stringify({ action: "completed" });
  const secret = "a-secure-webhook-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  expect(validSignature(body, signature, secret)).toBe(true);
  expect(validSignature(`${body}x`, signature, secret)).toBe(false);
  expect(validSignature(body, "sha256=zz", secret)).toBe(false);
  expect(validSignature(body, null, secret)).toBe(false);
});

describe("reconciliation authorization", () => {
  it("accepts the operator or cron bearer secret", () => {
    expect(isAuthorizedReconcile("Bearer operator-secret", "operator-secret", "cron-secret")).toBe(true);
    expect(isAuthorizedReconcile("bearer cron-secret", "operator-secret", "cron-secret")).toBe(true);
  });

  it("rejects missing and partial secrets", () => {
    expect(isAuthorizedReconcile(null, "operator-secret", "cron-secret")).toBe(false);
    expect(isAuthorizedReconcile("Bearer operator", "operator-secret", "cron-secret")).toBe(false);
  });
});
