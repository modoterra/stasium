import { describe, expect, test } from "bun:test";
import { ServiceManager, ServiceManagerError } from "./service-manager";
import type { ServiceConfig } from "./types";

const makeConfig = (name: string): ServiceConfig => ({
  name,
  command: ["bun", "--version"],
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
