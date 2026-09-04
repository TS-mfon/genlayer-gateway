import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/evidence/[workId]/route";

describe("phase-gate evidence endpoint", () => {
  it("serves immutable reachable evidence", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ workId: "job-01" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await response.json()).work.expected).toBe("PASS");
  });

  it("returns a non-200 status for intentionally unreachable evidence", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ workId: "job-07" }) });
    expect(response.status).toBe(503);
  });

  it("rejects unknown work IDs", async () => {
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ workId: "missing" }) });
    expect(response.status).toBe(404);
  });
});
