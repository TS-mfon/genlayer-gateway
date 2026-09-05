import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(process.cwd(), "app");
const componentRoot = path.resolve(process.cwd(), "components");

describe("public observatory boundary", () => {
  it("does not expose legacy write-oriented browser routes", () => {
    for (const route of [
      "create-job",
      "dashboard/client",
      "dashboard/worker",
      "playground",
      "test-console",
    ]) {
      expect(existsSync(path.join(appRoot, route, "page.tsx"))).toBe(false);
    }
  });

  it("keeps public observatory components free of wallet write primitives", () => {
    const source = [
      "cinematic-landing.tsx",
      "explorer.tsx",
      "explorer-detail.tsx",
    ].map((file) => readFileSync(path.join(componentRoot, file), "utf8")).join("\n");

    expect(source).not.toMatch(/window\.ethereum|writeContract|sendTransaction|eth_sendTransaction/);
  });

  it("retains only inspection-oriented public pages", () => {
    expect(existsSync(path.join(appRoot, "explorer"))).toBe(true);
    expect(existsSync(path.join(appRoot, "evidence"))).toBe(true);
    expect(existsSync(path.join(appRoot, "docs"))).toBe(true);
  });
});
