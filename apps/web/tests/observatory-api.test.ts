import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listRequestRecords,
  getRequestRecord,
  readDirectGenLayerResult,
  compareIndexedAndDirect,
  explorerConfig,
} = vi.hoisted(() => ({
  listRequestRecords: vi.fn(),
  getRequestRecord: vi.fn(),
  readDirectGenLayerResult: vi.fn(),
  compareIndexedAndDirect: vi.fn(),
  explorerConfig: vi.fn(),
}));

vi.mock("@/lib/db/requests", () => ({
  listRequestRecords,
  getRequestRecord,
}));

vi.mock("@/lib/explorer", () => ({
  readDirectGenLayerResult,
  compareIndexedAndDirect,
  explorerConfig,
}));

import { GET as listRequests } from "@/app/api/v1/requests/route";
import { GET as inspectRequest } from "@/app/api/v1/explorer/[requestId]/route";

const requestId = `0x${"ab".repeat(32)}`;
const record = {
  requestId,
  status: "FINALIZED",
  result: { decision: "PASS" },
};

beforeEach(() => {
  vi.clearAllMocks();
  listRequestRecords.mockResolvedValue([record]);
  getRequestRecord.mockResolvedValue(record);
  readDirectGenLayerResult.mockResolvedValue({
    source: "GENLAYER_DIRECT",
    contract: `0x${"cd".repeat(20)}`,
    state: "FINALIZED",
  });
  compareIndexedAndDirect.mockReturnValue({ comparable: true, matches: true });
  explorerConfig.mockReturnValue({ testnetOnly: true });
});

describe("read-only request observatory APIs", () => {
  it("passes bounded search parameters to the request index", async () => {
    const response = await listRequests(new Request(
      "https://gateway.test/api/v1/requests?q=github&status=FINALIZED&decision=PASS&limit=50",
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [record], count: 1 });
    expect(listRequestRecords).toHaveBeenCalledWith({
      limit: 50,
      query: "github",
      status: "FINALIZED",
      decision: "PASS",
    });
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
  });

  it.each(["0", "101", "abc", "1.5"])("rejects invalid limit %s", async (limit) => {
    const response = await listRequests(new Request(`https://gateway.test/api/v1/requests?limit=${limit}`));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_LIMIT");
    expect(listRequestRecords).not.toHaveBeenCalled();
  });

  it("returns a direct GenLayer inspection with comparison metadata", async () => {
    const response = await inspectRequest(new Request("https://gateway.test"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      request: record,
      direct: expect.objectContaining({ state: "FINALIZED" }),
      comparison: { comparable: true, matches: true },
      config: { testnetOnly: true },
    });
    expect(getRequestRecord).toHaveBeenCalledWith(requestId);
    expect(readDirectGenLayerResult).toHaveBeenCalledWith(record);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed request IDs before querying storage", async () => {
    const response = await inspectRequest(new Request("https://gateway.test"), {
      params: Promise.resolve({ requestId: "not-a-request-id" }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_REQUEST_ID");
    expect(getRequestRecord).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown request", async () => {
    getRequestRecord.mockResolvedValueOnce(null);
    const response = await inspectRequest(new Request("https://gateway.test"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("REQUEST_NOT_FOUND");
    expect(readDirectGenLayerResult).not.toHaveBeenCalled();
  });
});
