import { afterEach, describe, expect, test } from "bun:test";
import { createShutdownHandler } from "./shutdown";
import type { ServiceManager } from "./service-manager";

const handlers: Array<ReturnType<typeof createShutdownHandler>> = [];

afterEach(() => {
  while (handlers.length > 0) {
    handlers.pop()?.uninstall();
  }
});

describe("shutdown handler", () => {
  test("run is idempotent", async () => {
    let stopAllCalls = 0;
    let waitForExitCalls = 0;
    let forceStopAllCalls = 0;

    const manager = {
      stopAll: async () => {
        stopAllCalls += 1;
      },
      waitForExit: async () => {
        waitForExitCalls += 1;
        return waitForExitCalls > 1;
      },
      forceStopAll: async () => {
        forceStopAllCalls += 1;
      },
      getConfigs: () => [],
    } as unknown as ServiceManager;

    const shutdown = createShutdownHandler({
      cwd: process.cwd(),
      manager,
      getServicePids: () => [],
    });
    handlers.push(shutdown);

    await Promise.all([shutdown.run("first"), shutdown.run("second")]);

    expect(stopAllCalls).toBe(1);
    expect(forceStopAllCalls).toBe(1);
    expect(waitForExitCalls).toBe(2);
  });

  test("install does not register an exit listener", () => {
    const manager = {
      stopAll: async () => {},
      waitForExit: async () => true,
      forceStopAll: async () => {},
      getConfigs: () => [],
    } as unknown as ServiceManager;

    const before = process.listenerCount("exit");
    const shutdown = createShutdownHandler({
      cwd: process.cwd(),
      manager,
      getServicePids: () => [],
    });
    handlers.push(shutdown);

    shutdown.install();

    expect(process.listenerCount("exit")).toBe(before);
  });
});
