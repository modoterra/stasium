import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStartupUpdateCheck } from "./startup-update";

describe("Startup Update Check", () => {
  test("fails open when the Update Channel cannot be read", async () => {
    const result = await runStartupUpdateCheck({
      currentVersion: "0.1.0",
      executablePath: process.execPath,
      platform: { os: "linux", arch: "x64" },
      checkUpdate: async () => {
        throw new Error("network unavailable");
      },
    });

    expect(result.messages).toEqual(["Stasium update check failed: network unavailable"]);
  });

  test("applies safe updates and reports restart guidance", async () => {
    const result = await runStartupUpdateCheck({
      currentVersion: "0.1.0",
      executablePath: process.execPath,
      platform: { os: "linux", arch: "x64" },
      checkUpdate: async () => ({
        type: "update-available",
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        channel: "stable",
        artifact: {
          platform: { os: "linux", arch: "x64" },
          name: "stasium-linux-x64",
          url: "https://example.com/stasium-linux-x64",
          sha256: "abc123",
        },
      }),
      installUpdate: async () => ({ type: "installed", path: "/usr/local/bin/stasium" }),
    });

    expect(result.messages).toEqual(["Updated Stasium to 0.2.0. Restart Stasium to use it."]);
  });

  test("respects disabled user preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-startup-update-"));
    try {
      const preferencesPath = join(dir, "update.json");
      await writeFile(preferencesPath, JSON.stringify({ enabled: false }));
      let checked = false;

      const result = await runStartupUpdateCheck({
        currentVersion: "0.1.0",
        executablePath: process.execPath,
        platform: { os: "linux", arch: "x64" },
        preferencesPath,
        checkUpdate: async () => {
          checked = true;
          return { type: "up-to-date", currentVersion: "0.1.0", channel: "stable" };
        },
      });

      expect(result.messages).toEqual([]);
      expect(checked).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fails open when user preferences are malformed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-startup-update-"));
    try {
      const preferencesPath = join(dir, "update.json");
      await writeFile(preferencesPath, "not json");

      const result = await runStartupUpdateCheck({
        currentVersion: "0.1.0",
        executablePath: process.execPath,
        platform: { os: "linux", arch: "x64" },
        preferencesPath,
        checkUpdate: async () => ({
          type: "up-to-date",
          currentVersion: "0.1.0",
          channel: "stable",
        }),
      });

      expect(result.messages[0]).toStartWith("Stasium update check failed:");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
