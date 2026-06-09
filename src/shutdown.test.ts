import { afterEach, describe, expect, test } from "bun:test";
import { ExternalRuntimeVisibilityManager, type ExternalRuntime } from "./external-runtime";
import { getExternalRuntimeStatus } from "./runtime-status";
import { createShutdownHandler } from "./shutdown";
import type { ServiceManager } from "./service-manager";
import type { ExternalManagedProcess, LogEntry } from "./types";

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

  test("reports External Runtime Session cleanup failures and completes shutdown", async () => {
    const messages: string[] = [];
    const calls: string[] = [];
    const manager = {
      stopAll: async () => {
        calls.push("stop direct");
      },
      waitForExit: async () => true,
      forceStopAll: async () => {
        calls.push("force stop direct");
      },
      getConfigs: () => [],
    } as unknown as ServiceManager;
    const externalRuntimeManager = {
      stopSessionStartedProcesses: async (logger?: (message: string) => void) => {
        calls.push("stop external session");
        logger?.('External Runtime cleanup warning for "docker:db": stop failed');
      },
    } as unknown as ExternalRuntimeVisibilityManager;
    const shutdown = createShutdownHandler({
      cwd: process.cwd(),
      manager,
      externalRuntimeManager,
      getServicePids: () => [],
      logger: (message) => messages.push(message),
      onAfter: () => {
        calls.push("after cleanup");
      },
    });
    handlers.push(shutdown);

    await shutdown.run();

    expect(calls).toEqual(["stop direct", "stop external session", "after cleanup"]);
    expect(messages).toEqual(['External Runtime cleanup warning for "docker:db": stop failed']);
  });

  test("does not stop manually started External Managed Processes during shutdown", async () => {
    const actions: string[] = [];
    let state: ExternalManagedProcess["state"] = "exited";
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([
      runtime("docker", () => [externalProcess("docker", "db", state)], actions),
    ]);
    const shutdown = createShutdownHandler({
      cwd: process.cwd(),
      manager: stoppedManager(),
      externalRuntimeManager,
      getServicePids: () => [],
    });
    handlers.push(shutdown);

    await externalRuntimeManager.refresh();
    await externalRuntimeManager.start("db");
    state = "running";
    await shutdown.run();

    expect(actions).toEqual(["docker:start:db"]);
  });

  test("stops auto-started External Managed Processes during shutdown", async () => {
    const actions: string[] = [];
    let state: ExternalManagedProcess["state"] = "exited";
    const testRuntime = runtime("docker", () => [externalProcess("docker", "db", state)], actions);
    testRuntime.start = async (name) => {
      actions.push(`docker:start:${name}`);
      state = "running";
    };
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([testRuntime]);
    const shutdown = createShutdownHandler({
      cwd: process.cwd(),
      manager: stoppedManager(),
      externalRuntimeManager,
      getServicePids: () => [],
    });
    handlers.push(shutdown);

    await externalRuntimeManager.ensureProcessAvailable("db");
    await shutdown.run();

    expect(actions).toEqual(["docker:start:db", "docker:stop:db"]);
  });
});

const stoppedManager = (): ServiceManager =>
  ({
    stopAll: async () => {},
    waitForExit: async () => true,
    forceStopAll: async () => {},
    getConfigs: () => [],
  }) as unknown as ServiceManager;

const runtime = (
  id: string,
  getProcesses: () => ExternalManagedProcess[],
  actions: string[] = [],
): ExternalRuntime => ({
  id,
  name: id,
  snapshot: async () => getProcesses(),
  isAvailable: (process) => process.state === "running",
  start: async (name) => {
    actions.push(`${id}:start:${name}`);
  },
  stop: async (name) => {
    actions.push(`${id}:stop:${name}`);
  },
  restart: async (name) => {
    actions.push(`${id}:restart:${name}`);
  },
  streamOutput: (_name: string, _onOutput: (entry: LogEntry) => void) => null,
  destroy: async () => {},
});

const externalProcess = (
  runtimeId: string,
  name: string,
  state: ExternalManagedProcess["state"],
): ExternalManagedProcess => ({
  runtimeId,
  runtimeName: runtimeId,
  name,
  state,
  runtimeStatus: getExternalRuntimeStatus(state),
  status: state,
  ports: "",
});
