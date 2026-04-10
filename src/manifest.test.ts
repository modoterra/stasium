import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManifestError, loadManifest, renderManifest } from "./manifest";
import type { AppConfig, ServiceConfig } from "./types";

const writeTempManifest = async (
  services: ServiceConfig[],
  app?: AppConfig,
): Promise<{ manifestPath: string; dir: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
  const manifestPath = join(dir, "stasium.toml");
  await Bun.write(manifestPath, renderManifest(services, app));
  return { manifestPath, dir };
};

describe("manifest rendering", () => {
  test("preserves env keys containing dots", async () => {
    const { manifestPath, dir } = await writeTempManifest([
      {
        name: "api",
        command: ["bun", "run", "dev"],
        env: { "APP.CONFIG": "on" },
      },
    ]);

    try {
      const manifest = await loadManifest(manifestPath);
      expect(manifest.services[0]?.env?.["APP.CONFIG"]).toBe("on");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects dependency cycles", async () => {
    const { manifestPath, dir } = await writeTempManifest([
      {
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["worker"],
      },
      {
        name: "worker",
        command: ["bun", "run", "worker"],
        depends_on: ["api"],
      },
    ]);

    try {
      await expect(loadManifest(manifestPath)).rejects.toThrow(ManifestError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("loads app docker config", async () => {
    const { manifestPath, dir } = await writeTempManifest([], {
      docker: { enabled: false },
    });

    try {
      const manifest = await loadManifest(manifestPath);
      expect(manifest.app?.docker?.enabled).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("defaults docker config to enabled when omitted", async () => {
    const { manifestPath, dir } = await writeTempManifest([]);

    try {
      const manifest = await loadManifest(manifestPath);
      expect(manifest.app?.docker?.enabled ?? true).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects non-boolean docker enabled values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
    const manifestPath = join(dir, "stasium.toml");
    await Bun.write(manifestPath, ["[app.docker]", 'enabled = "no"'].join("\n"));

    try {
      await expect(loadManifest(manifestPath)).rejects.toThrow(ManifestError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
