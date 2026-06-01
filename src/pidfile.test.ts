import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { readLiveProcessInfo } from "./process-info";
import { cleanupExistingPids, setPidDirRootForTests, writePidFiles } from "./pidfile";
import { normalizeProcessDefinition } from "./process-definition";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager } from "./service-manager";

const checksum = (value: string): string => createHash("md5").update(value).digest("hex");

const getPidDir = (root: string, cwd: string): string => resolve(root, checksum(realpathSync(cwd)));

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 50,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(intervalMs);
  }
  return predicate();
};

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const cleanupPaths: string[] = [];

afterEach(async () => {
  setPidDirRootForTests(null);
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();
    if (!path) continue;
    await rm(path, { recursive: true, force: true });
  }
});

const createTestCwd = async (): Promise<{ cwd: string; pidRoot: string; pidDir: string }> => {
  const cwd = await mkdtemp(resolve(tmpdir(), "stasium-pidfile-"));
  const pidRoot = await mkdtemp(resolve(tmpdir(), "stasium-pid-root-"));
  const pidDir = getPidDir(pidRoot, cwd);
  setPidDirRootForTests(pidRoot);
  cleanupPaths.push(cwd, pidRoot, pidDir);
  return { cwd, pidRoot, pidDir };
};

const spawnIdleProcess = () =>
  Bun.spawn({
    cmd: ["bun", "-e", "setInterval(() => {}, 1000)"],
    stdout: "ignore",
    stderr: "ignore",
  });

describe("pidfile cleanup", () => {
  test("writePidFiles writes structured launch identity for running services", async () => {
    if (process.platform === "win32") return;

    const { cwd, pidDir } = await createTestCwd();
    const manager = new ServiceManager([
      normalizeProcessDefinition({
        name: "api",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      }),
    ]);

    try {
      await manager.startAll();
      const started = await waitFor(() => manager.getServicePids().length === 1);
      expect(started).toBe(true);

      const [service] = manager.getServicePids();
      expect(service).toBeDefined();
      if (!service) {
        throw new Error("Expected running service metadata.");
      }

      await writePidFiles(cwd, manager.getServicePids());
      const contents = await readFile(resolve(pidDir, "api.pid"), "utf8");
      const parsed = JSON.parse(contents) as {
        pid: number;
        service: string;
        cwd: string;
        command: string[];
        startedAt: string;
        identityVerified: boolean;
      };

      expect(parsed.pid).toBe(service.pid);
      expect(parsed.service).toBe("api");
      expect(parsed.cwd).toBe(service.workingDir);
      expect(parsed.command).toEqual(service.command);
      expect(parsed.startedAt).toBe(service.startedAt);
      expect(parsed.identityVerified).toBe(true);
    } finally {
      await manager.stopAll();
    }
  });

  test("cleanupExistingPids stops matching live process claims", async () => {
    if (process.platform === "win32") return;

    const { cwd, pidDir } = await createTestCwd();
    const proc = spawnIdleProcess();

    try {
      const liveInfo = await readLiveProcessInfo(proc.pid);
      expect(liveInfo).not.toBeNull();
      if (!liveInfo) {
        throw new Error("Expected live process info.");
      }
      await mkdir(pidDir, { recursive: true });
      await writeFile(
        resolve(pidDir, "api.pid"),
        JSON.stringify({
          version: 1,
          pid: proc.pid,
          service: "api",
          cwd,
          command: liveInfo.command
            ? [liveInfo.command]
            : ["bun", "-e", "setInterval(() => {}, 1000)"],
          startedAt: liveInfo.startedAt,
          identityVerified: true,
          platform: process.platform,
        }),
      );

      await cleanupExistingPids(cwd, { knownServices: ["api"] });

      expect(isProcessAlive(proc.pid)).toBe(false);
      await expect(access(resolve(pidDir, "api.pid"))).rejects.toThrow();
    } finally {
      if (isProcessAlive(proc.pid)) {
        process.kill(proc.pid, "SIGKILL");
      }
      await proc.exited;
    }
  });

  test("cleanupExistingPids skips live processes when pidfile identity mismatches", async () => {
    if (process.platform === "win32") return;

    const { cwd, pidDir } = await createTestCwd();
    const proc = spawnIdleProcess();

    try {
      const liveInfo = await readLiveProcessInfo(proc.pid);
      expect(liveInfo).not.toBeNull();
      if (!liveInfo) {
        throw new Error("Expected live process info.");
      }
      await mkdir(pidDir, { recursive: true });
      await writeFile(
        resolve(pidDir, "api.pid"),
        JSON.stringify({
          version: 1,
          pid: proc.pid,
          service: "api",
          cwd,
          command: ["bun", "-e", "setInterval(() => {}, 1000)"],
          startedAt: `${liveInfo.startedAt}-stale`,
          identityVerified: true,
          platform: process.platform,
        }),
      );

      await cleanupExistingPids(cwd, { knownServices: ["api"] });

      expect(isProcessAlive(proc.pid)).toBe(true);
      await expect(access(resolve(pidDir, "api.pid"))).resolves.toBeNull();
    } finally {
      if (isProcessAlive(proc.pid)) {
        process.kill(proc.pid, "SIGKILL");
      }
      await proc.exited;
    }
  });

  test("cleanupExistingPids skips live processes from legacy pidfiles", async () => {
    const { cwd, pidDir } = await createTestCwd();
    const proc = spawnIdleProcess();

    try {
      await mkdir(pidDir, { recursive: true });
      await writeFile(resolve(pidDir, "api.pid"), `${proc.pid}`);

      await cleanupExistingPids(cwd, { knownServices: ["api"] });

      expect(isProcessAlive(proc.pid)).toBe(true);
      await expect(access(resolve(pidDir, "api.pid"))).resolves.toBeNull();
    } finally {
      if (isProcessAlive(proc.pid)) {
        process.kill(proc.pid, "SIGKILL");
      }
      await proc.exited;
    }
  });

  test("claiming one direct-managed process preserves other workspace claims", async () => {
    if (process.platform === "win32") return;

    const { cwd } = await createTestCwd();
    const manager = new ServiceManager(
      [
        normalizeProcessDefinition({
          name: "app",
          command: ["bun", "-e", "setInterval(() => {}, 1000)"],
          working_dir: cwd,
        }),
        normalizeProcessDefinition({
          name: "frontend",
          command: ["bun", "-e", "setInterval(() => {}, 1000)"],
          working_dir: cwd,
        }),
      ],
      { processClaimStore: new ProcessClaimStore(cwd) },
    );

    try {
      await manager.startSelected();
      const appStarted = await waitFor(() => manager.getViews()[0]?.state === "RUNNING");
      expect(appStarted).toBe(true);

      manager.setSelectedIndex(1);
      await manager.startSelected();
      const frontendStarted = await waitFor(() => manager.getViews()[1]?.state === "RUNNING");
      expect(frontendStarted).toBe(true);

      await delay(500);

      expect(manager.getViews()[0]?.state).toBe("RUNNING");
      expect(manager.getViews()[1]?.state).toBe("RUNNING");
    } finally {
      await manager.stopAll();
    }
  });
});
