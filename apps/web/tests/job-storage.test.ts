import { afterEach, describe, expect, it } from "vitest";
import { JOBS_STORAGE_KEY, readJobs, writeJobs, type GatewayJob } from "@/lib/jobs";

const originalWindow = globalThis.window;

function installStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(JOBS_STORAGE_KEY, initial);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage;
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: () => true,
  } as unknown as Window & typeof globalThis;
  return values;
}

const validJob: GatewayJob = {
  id: "chain-1",
  title: "Test job",
  description: "Test description",
  policy: "Test policy",
  worker: "0x1111111111111111111111111111111111111111",
  client: "0x2222222222222222222222222222222222222222",
  bountyEth: "0.01",
  evidenceUri: "",
  evidenceHash: "",
  status: "OPEN",
  chain: "Base Sepolia",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

afterEach(() => {
  globalThis.window = originalWindow;
});

describe("browser job persistence", () => {
  it("fails closed when storage contains malformed data", () => {
    installStorage(JSON.stringify({ unexpected: true }));
    expect(readJobs()).toEqual([]);
  });

  it("keeps valid jobs and drops malformed entries", () => {
    installStorage(JSON.stringify([validJob, { id: "incomplete" }]));
    expect(readJobs()).toEqual([validJob]);
  });

  it("writes only valid job projections", () => {
    const values = installStorage();
    writeJobs([validJob, { id: "incomplete" } as GatewayJob]);
    expect(JSON.parse(values.get(JOBS_STORAGE_KEY) ?? "null")).toEqual([validJob]);
  });
});
