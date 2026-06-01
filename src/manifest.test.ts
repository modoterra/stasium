import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ManifestError, loadManifest, renderManifest } from "./manifest";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import type { AppConfig } from "./types";

const writeTempManifest = async (
  services: ProcessDefinitionInput[],
  app?: AppConfig,
): Promise<{ manifestPath: string; dir: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
  const manifestPath = join(dir, "stasium.toml");
  await Bun.write(
    manifestPath,
    renderManifest(
      services.map((service) => normalizeProcessDefinition(service, { baseDir: dir })),
      app,
    ),
  );
  return { manifestPath, dir };
};

describe("manifest rendering", () => {
  test("preserves env keys containing dots", async () => {
    const { manifestPath, dir } = await writeTempManifest([
      {
        name: "api",
        launchInstruction: ["bun", "run", "dev"],
        environment: { "APP.CONFIG": "on" },
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
        launchInstruction: ["bun", "run", "dev"],
        startupDependencies: ["worker"],
      },
      {
        name: "worker",
        launchInstruction: ["bun", "run", "worker"],
        startupDependencies: ["api"],
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

  test("loads normalized process definitions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
    const manifestPath = join(dir, "stasium.toml");
    await Bun.write(
      manifestPath,
      [
        "[[service]]",
        'name = " db "',
        'command = ["bun", "--version"]',
        "",
        "[[service]]",
        'name = " api "',
        'command = "bun run dev"',
        'working_dir = "app"',
        'depends_on = [" db "]',
        "[service.env]",
        "PORT = 3000",
      ].join("\n"),
    );

    try {
      const manifest = await loadManifest(manifestPath);
      expect(manifest.services[0]).toMatchObject({
        name: "db",
        environment: {},
        restartRule: "never",
        startupDependencies: [],
      });
      expect(manifest.services[1]).toMatchObject({
        name: "api",
        workingDir: resolve(dir, "app"),
        environment: { PORT: "3000" },
        launchInstruction: { executable: "bun", arguments: ["run", "dev"] },
        startupDependencies: ["db"],
        restartRule: "never",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects duplicate names after trimming", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
    const manifestPath = join(dir, "stasium.toml");
    await Bun.write(
      manifestPath,
      [
        "[[service]]",
        'name = "api"',
        'command = ["bun", "--version"]',
        "",
        "[[service]]",
        'name = " api "',
        'command = ["bun", "--version"]',
      ].join("\n"),
    );

    try {
      await expect(loadManifest(manifestPath)).rejects.toThrow(ManifestError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects shell-style launch instructions during loading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-manifest-"));
    const manifestPath = join(dir, "stasium.toml");
    await Bun.write(
      manifestPath,
      ["[[service]]", 'name = "api"', 'command = "bun run dev && bun run worker"'].join("\n"),
    );

    try {
      await expect(loadManifest(manifestPath)).rejects.toThrow(ManifestError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
