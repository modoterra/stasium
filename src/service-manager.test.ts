import { describe, expect, test } from "bun:test";
import { ServiceManager, ServiceManagerError } from "./service-manager";
import type { ServiceConfig } from "./types";

const makeConfig = (name: string): ServiceConfig => ({
  name,
  command: ["bun", "--version"],
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 50,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await delay(intervalMs);
  }
  return predicate();
};

describe("ServiceManager", () => {
  test("rejects duplicate names when adding services", async () => {
    const manager = new ServiceManager([makeConfig("api")]);
    await expect(manager.addService(makeConfig("api"))).rejects.toThrow(ServiceManagerError);
  });

  test("rejects duplicate names when editing services", async () => {
    const manager = new ServiceManager([makeConfig("api"), makeConfig("worker")]);
    await expect(manager.updateServiceConfig(0, makeConfig("worker"))).rejects.toThrow(
      ServiceManagerError,
    );
  });

  test("starts dependencies before selected service", async () => {
    const manager = new ServiceManager([
      {
        name: "db",
        command: ["bun", "-e", "setTimeout(() => process.exit(0), 400)"],
      },
      {
        name: "api",
        command: ["bun", "-e", "setTimeout(() => process.exit(0), 400)"],
        depends_on: ["db"],
      },
    ]);

    manager.setSelectedIndex(1);
    await manager.startSelected();

    const pids = manager.getServicePids().map((entry) => entry.name);
    expect(pids.includes("db")).toBe(true);
    expect(pids.includes("api")).toBe(true);

    await manager.stopAll();
  });

  test("stops selected dependency and its dependents", async () => {
    const manager = new ServiceManager([
      {
        name: "db",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      },
      {
        name: "api",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
        depends_on: ["db"],
      },
    ]);

    await manager.startAll();
    const started = await waitFor(() => manager.getServicePids().length === 2);
    expect(started).toBe(true);

    manager.setSelectedIndex(0);
    await manager.stopSelected();

    const stopped = await waitFor(() => manager.getServicePids().length === 0);
    expect(stopped).toBe(true);
  });

  test("force-stops stubborn services that ignore SIGINT and SIGTERM", async () => {
    const stubbornScript = [
      "process.on('SIGINT', () => {});",
      "process.on('SIGTERM', () => {});",
      "setInterval(() => {}, 1000);",
    ].join(" ");

    const manager = new ServiceManager([
      {
        name: "stubborn",
        command: ["bun", "-e", stubbornScript],
      },
    ]);

    await manager.startAll();
    const started = await waitFor(() => manager.getServicePids().length === 1);
    expect(started).toBe(true);

    await manager.stopAll();

    const stopped = await waitFor(() => manager.getServicePids().length === 0, 5000);
    expect(stopped).toBe(true);
  });

  test("stops child processes spawned by services", async () => {
    const childScript = "setInterval(() => {}, 1000);";
    const parentScript = [
      `const child = Bun.spawn({ cmd: [\"bun\", \"-e\", ${JSON.stringify(childScript)}], stdout: \"ignore\", stderr: \"ignore\" });`,
      "console.log(`child:${child.pid}`);",
      "setInterval(() => {}, 1000);",
    ].join(" ");

    const manager = new ServiceManager([
      {
        name: "tree",
        command: ["bun", "-e", parentScript],
      },
    ]);

    let childPid: number | null = null;

    try {
      await manager.startAll();
      const started = await waitFor(() => manager.getServicePids().length === 1);
      expect(started).toBe(true);

      const childDetected = await waitFor(() => {
        const lines = manager.getSelectedView()?.log.all() ?? [];
        for (const entry of lines) {
          const match = /^child:(\d+)$/.exec(entry.line.trim());
          if (!match) continue;
          const parsed = Number.parseInt(match[1] ?? "", 10);
          if (!Number.isFinite(parsed) || parsed <= 0) continue;
          childPid = parsed;
          return true;
        }
        return false;
      }, 3000);
      expect(childDetected).toBe(true);

      await manager.stopAll();
      const stopped = await waitFor(() => manager.getServicePids().length === 0, 5000);
      expect(stopped).toBe(true);

      const pid = childPid;
      expect(pid).not.toBeNull();
      if (pid !== null) {
        const childExited = await waitFor(() => !isProcessAlive(pid), 3000);
        expect(childExited).toBe(true);
      }
    } finally {
      const pid = childPid;
      if (pid !== null && isProcessAlive(pid)) {
        process.kill(pid, "SIGKILL");
      }
    }
  });

  test("restarts failed services with on-failure policy", async () => {
    const manager = new ServiceManager([
      {
        name: "failing",
        command: ["bun", "-e", "process.exit(1)"],
        restart_policy: "on-failure",
      },
    ]);

    await manager.startAll();
    const hasPendingRestart = await waitFor(() => {
      const view = manager.getSelectedView();
      return (view?.restartInMs ?? 0) > 0;
    });

    expect(hasPendingRestart).toBe(true);

    const restarted = await waitFor(() => {
      const view = manager.getSelectedView();
      return (view?.restartCount ?? 0) > 0;
    });

    expect(restarted).toBe(true);

    await manager.stopAll();
    const restartCount = manager.getSelectedView()?.restartCount ?? 0;
    await delay(500);
    const afterStopRestartCount = manager.getSelectedView()?.restartCount ?? 0;
    expect(afterStopRestartCount).toBe(restartCount);
  });
});
