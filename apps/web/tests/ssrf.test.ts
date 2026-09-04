import { describe, expect, it } from "vitest";
import { assertSafeEvidenceUrl } from "@/lib/security/ssrf";

describe("evidence URL SSRF policy", () => {
  it("requires HTTPS", async () => {
    await expect(assertSafeEvidenceUrl("http://example.com/data")).rejects.toThrow("HTTPS");
  });

  it("blocks loopback and credentials", async () => {
    await expect(assertSafeEvidenceUrl("https://127.0.0.1/data")).rejects.toThrow("Private");
    await expect(assertSafeEvidenceUrl("https://user:pass@example.com/data")).rejects.toThrow("Credentials");
  });

  it("enforces the configured domain allowlist", async () => {
    await expect(assertSafeEvidenceUrl("https://example.com/data", ["github.com"])).rejects.toThrow("allowlisted");
  });
});
