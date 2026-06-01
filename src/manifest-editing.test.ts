import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LaunchInstructionExecutionAdapter } from "./launch-execution";
import {
  addProcessDefinition,
  removeSelectedProcessDefinition,
  replaceProcessDefinition,
} from "./manifest-editing";
import { loadManifest, renderServiceBlock, saveManifest } from "./manifest";
import { normalizeProcessDefinition } from "./process-definition";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager } from "./service-manager";

const launchPid = (pid: number): LaunchInstructionExecutionAdapter =>
  new LaunchInstructionExecutionAdapter({
    now: () => "now",
    pathReader: async () => process.env.PATH ?? "",
    processInfoReader: async (nextPid) => ({ pid: nextPid, startedAt: "started", command: null }),
    spawner: () => ({
      pid,
      stdout: null,
      stderr: null,
      exited: new Promise(() => {}),
      signalCode: null,
      kill: () => {},
    }),
  });

class TestClaims extends ProcessClaimStore {
  cleanedUpNames: string[] = [];

  override async claimDirectManagedProcess(): Promise<void> {}

  override async releaseDirectManagedProcess(): Promise<void> {}

  override async cleanupRemovedDirectManagedProcessClaims(names: string[]): Promise<void> {
    this.cleanedUpNames.push(...names);
  }
}

class FailingReleaseClaims extends TestClaims {
  override async cleanupRemovedDirectManagedProcessClaims(): Promise<void> {
    throw new Error("release failed");
  }
}

describe("Manifest Editing", () => {
  test("adds a Process Definition through one persisted runtime apply flow", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      await saveManifest(manifestPath, []);
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([], {
        processClaimStore: claims,
        launchAdapter: launchPid(30),
      });

      await addProcessDefinition(
        { manifestPath, manager, processClaimStore: claims },
        { name: "api", launchInstruction: "bun run dev" },
      );

      const manifest = await loadManifest(manifestPath);
      expect(manager.getConfigs().map((config) => config.name)).toEqual(["api"]);
      expect(manifest.services.map((config) => config.name)).toEqual(["api"]);
      expect(manager.getSelectedView()?.state).toBe("RUNNING");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("validates the next Process Definition collection before saving", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      await saveManifest(manifestPath, []);
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([], { processClaimStore: claims });

      await expect(
        addProcessDefinition(
          { manifestPath, manager, processClaimStore: claims },
          { name: "api", launchInstruction: "bun run dev", startupDependencies: ["missing"] },
        ),
      ).rejects.toThrow('depends on unknown service "missing"');

      const manifest = await loadManifest(manifestPath);
      expect(manifest.services).toEqual([]);
      expect(manager.getConfigs()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not apply a Process Definition when the Manifest cannot be saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    try {
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([], { processClaimStore: claims });

      await expect(
        addProcessDefinition(
          { manifestPath: dir, manager, processClaimStore: claims },
          { name: "api", launchInstruction: "bun run dev" },
        ),
      ).rejects.toThrow();

      expect(manager.getConfigs()).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("replaces a Process Definition and cleans up the old Process Claim name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      const original = normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run dev",
      });
      await saveManifest(manifestPath, [original]);
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([original], {
        processClaimStore: claims,
        launchAdapter: launchPid(31),
      });
      const view = manager.getSelectedView();
      if (view) view.restartInMs = 123;

      const replacement = normalizeProcessDefinition({
        name: "web",
        launchInstruction: "bun run dev",
      });
      await replaceProcessDefinition(
        { manifestPath, manager, processClaimStore: claims },
        0,
        renderServiceBlock(replacement),
      );

      const manifest = await loadManifest(manifestPath);
      expect(manager.getConfigs().map((config) => config.name)).toEqual(["web"]);
      expect(manifest.services.map((config) => config.name)).toEqual(["web"]);
      expect(claims.cleanedUpNames).toEqual(["api"]);
      expect(manager.getSelectedView()?.restartInMs).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("does not replace or clean up claims when the Manifest cannot be saved", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    try {
      const original = normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run dev",
      });
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([original], { processClaimStore: claims });
      const replacement = normalizeProcessDefinition({
        name: "web",
        launchInstruction: "bun run dev",
      });

      await expect(
        replaceProcessDefinition(
          { manifestPath: dir, manager, processClaimStore: claims },
          0,
          renderServiceBlock(replacement),
        ),
      ).rejects.toThrow();

      expect(manager.getConfigs().map((config) => config.name)).toEqual(["api"]);
      expect(claims.cleanedUpNames).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports Process Claim release failures as warnings after a successful edit", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      const original = normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run dev",
      });
      await saveManifest(manifestPath, [original]);
      const claims = new FailingReleaseClaims(dir);
      const manager = new ServiceManager([original], { processClaimStore: claims });
      const replacement = normalizeProcessDefinition({
        name: "web",
        launchInstruction: "bun run dev",
      });

      const result = await replaceProcessDefinition(
        { manifestPath, manager, processClaimStore: claims },
        0,
        renderServiceBlock(replacement),
      );

      const manifest = await loadManifest(manifestPath);
      expect(manager.getConfigs().map((config) => config.name)).toEqual(["web"]);
      expect(manifest.services.map((config) => config.name)).toEqual(["web"]);
      expect(result.warnings).toEqual([
        "Failed to clean up removed Process Claims: release failed",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("deletes the selected Process Definition and cleans up its Process Claim name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-edit-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      const original = normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run dev",
      });
      await saveManifest(manifestPath, [original]);
      const claims = new TestClaims(dir);
      const manager = new ServiceManager([original], { processClaimStore: claims });

      await removeSelectedProcessDefinition({ manifestPath, manager, processClaimStore: claims });

      const manifest = await loadManifest(manifestPath);
      expect(manager.getConfigs()).toEqual([]);
      expect(manifest.services).toEqual([]);
      expect(claims.cleanedUpNames).toEqual(["api"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
