import { afterEach, describe, expect, test } from "bun:test";
import { setPathReaderForTests, resetPathCacheForTests } from "./service";
import { ServiceManager } from "./service-manager";

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 25,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
};

afterEach(() => {
  resetPathCacheForTests();
});

describe("service PATH cache", () => {
  test("reads PATH from the shell once per app session", async () => {
    let reads = 0;
    setPathReaderForTests(async () => {
      reads += 1;
      return process.env.PATH ?? "";
    });

    const manager = new ServiceManager([
      {
        name: "api",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      },
      {
        name: "worker",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      },
    ]);

    try {
      await manager.startAll();
      const started = await waitFor(() => manager.getServicePids().length === 2);
      expect(started).toBe(true);
      expect(reads).toBe(1);
    } finally {
      await manager.stopAll();
    }
  });
});
