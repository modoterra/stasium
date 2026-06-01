import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultUpdatePreferencesPath, loadUpdatePreferences } from "./update-preferences";

describe("Update Preferences", () => {
  test("defaults to enabled stable update checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-prefs-"));
    try {
      await expect(loadUpdatePreferences(join(dir, "missing.json"))).resolves.toEqual({
        enabled: true,
        channel: "stable",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("loads user opt-out and channel selection outside the Manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-prefs-"));
    try {
      const path = defaultUpdatePreferencesPath(dir);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify({ enabled: false, channel: "nightly" }));

      await expect(loadUpdatePreferences(path)).resolves.toEqual({
        enabled: false,
        channel: "nightly",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
