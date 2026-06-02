import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessOutputStore } from "./process-output-store";

describe("Process Output Store", () => {
  test("persists Direct Managed Process output by Project and name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-output-"));
    try {
      const store = new ProcessOutputStore("/project", { root: dir });
      await store.append("web", {
        timestamp: "2026-01-01T00:00:00.000Z",
        stream: "stdout",
        line: "ready",
      });

      await expect(store.read("web")).resolves.toBe("2026-01-01T00:00:00.000Z [OUT] ready\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
