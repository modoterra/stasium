import { describe, expect, test } from "bun:test";
import { ExternalRuntimeVisibilityManager, type ExternalRuntime } from "./external-runtime";
import { LaunchInstructionExecutionAdapter } from "./launch-execution";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager, ServiceManagerError } from "./service-manager";
import type { ExternalManagedProcess, LogEntry, ServiceConfig, ServicePid } from "./types";

const service = (input: ProcessDefinitionInput): ServiceConfig => normalizeProcessDefinition(input);

const makeConfig = (name: string): ServiceConfig =>
  service({
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

const launchLongRunningPid = (pid: number): LaunchInstructionExecutionAdapter =>
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

const externalProcess = (
  name: string,
  state: ExternalManagedProcess["state"],
): ExternalManagedProcess => ({
  runtimeId: "docker-compose",
  runtimeName: "Docker Compose",
  name,
  state,
  status: state,
  ports: "",
});

const externalRuntime = (
  getProcesses: () => ExternalManagedProcess[],
  actions: string[] = [],
): ExternalRuntime => ({
  id: "docker-compose",
  name: "Docker Compose",
  snapshot: async () => getProcesses(),
  isAvailable: (process) => process.state === "running",
  start: async (name) => {
    actions.push(`start:${name}`);
  },
  stop: async (name) => {
    actions.push(`stop:${name}`);
  },
  restart: async (name) => {
    actions.push(`restart:${name}`);
  },
  streamOutput: (_name: string, _onOutput: (entry: LogEntry) => void) => null,
  destroy: async () => {},
});

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
      service({
        name: "db",
        command: ["bun", "-e", "setTimeout(() => process.exit(0), 400)"],
      }),
      service({
        name: "api",
        command: ["bun", "-e", "setTimeout(() => process.exit(0), 400)"],
        depends_on: ["db"],
      }),
    ]);

    manager.setSelectedIndex(1);
    await manager.startSelected();

    const pids = manager.getServicePids().map((entry) => entry.name);
    expect(pids.includes("db")).toBe(true);
    expect(pids.includes("api")).toBe(true);

    await manager.stopAll();
  });

  test("starts unavailable External Managed Process dependencies before direct processes", async () => {
    const actions: string[] = [];
    const claims: string[] = [];
    class TestClaims extends ProcessClaimStore {
      override async claimDirectManagedProcess(claim: ServicePid): Promise<void> {
        claims.push(claim.name);
      }
    }
    let dbState: ExternalManagedProcess["state"] = "exited";
    const runtime = externalRuntime(() => [externalProcess("db", dbState)], actions);
    const originalStart = runtime.start!;
    runtime.start = async (name) => {
      await originalStart(name);
      dbState = "running";
    };
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([runtime]);
    const manager = new ServiceManager(
      [
        service({
          name: "api",
          command: ["bun", "run", "dev"],
          depends_on: ["db"],
        }),
      ],
      {
        externalRuntimeManager,
        launchAdapter: launchLongRunningPid(20),
        processClaimStore: new TestClaims(process.cwd()),
      },
    );

    await manager.startAll();

    expect(actions).toEqual(["start:db"]);
    expect(claims).toEqual(["api"]);
    expect(manager.getSelectedView()?.state).toBe("RUNNING");
    expect(manager.getServicePids()).toHaveLength(1);
  });

  test("blocks direct processes when External Managed Process dependencies stay unavailable", async () => {
    const actions: string[] = [];
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([
      externalRuntime(() => [externalProcess("db", "exited")], actions),
    ]);
    const manager = new ServiceManager(
      [
        service({
          name: "api",
          command: ["bun", "run", "dev"],
          depends_on: ["db"],
        }),
      ],
      { externalRuntimeManager, launchAdapter: launchLongRunningPid(21) },
    );

    await manager.startAll();

    expect(actions).toEqual(["start:db"]);
    expect(manager.getSelectedView()?.state).toBe("BLOCKED");
    expect(manager.getServicePids()).toHaveLength(0);
  });

  test("stops selected dependency and its dependents", async () => {
    const manager = new ServiceManager([
      service({
        name: "db",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      }),
      service({
        name: "api",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
        depends_on: ["db"],
      }),
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
      service({
        name: "stubborn",
        command: ["bun", "-e", stubbornScript],
      }),
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
      `const child = Bun.spawn({ cmd: ["bun", "-e", ${JSON.stringify(childScript)}], stdout: "ignore", stderr: "ignore" });`,
      "console.log(`child:${child.pid}`);",
      "setInterval(() => {}, 1000);",
    ].join(" ");

    const manager = new ServiceManager([
      service({
        name: "tree",
        command: ["bun", "-e", parentScript],
      }),
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
      service({
        name: "failing",
        command: ["bun", "-e", "process.exit(1)"],
        restart_policy: "on-failure",
      }),
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
    expect(manager.getSelectedView()?.manualRestartCount).toBe(0);
  });

  test("reports blocked state when a startup dependency fails", async () => {
    const launched: string[] = [];
    const launchAdapter = new LaunchInstructionExecutionAdapter({
      now: () => "now",
      pathReader: async () => process.env.PATH ?? "",
      spawner: (options) => {
        launched.push(options.cmd[0] ?? "");
        if (options.cmd[0] === "missing") {
          throw new Error("missing executable");
        }
        return {
          pid: 1,
          stdout: null,
          stderr: null,
          exited: new Promise(() => {}),
          signalCode: null,
          kill: () => {},
        };
      },
    });
    const manager = new ServiceManager(
      [
        service({
          name: "db",
          command: ["missing"],
        }),
        service({
          name: "api",
          command: ["bun", "run", "dev"],
          depends_on: ["db"],
        }),
      ],
      { launchAdapter },
    );

    await manager.startAll();

    expect(manager.getViews()[1]?.state).toBe("BLOCKED");
    expect(manager.getViews()[1]?.log.all().at(-1)?.line).toBe(
      'Startup blocked by failed Startup Dependency "db".',
    );
    expect(launched).toEqual(["missing"]);
  });

  test("tracks manual restarts separately from automatic Restart Rule attempts", async () => {
    const manager = new ServiceManager([
      service({
        name: "api",
        command: ["bun", "-e", "setInterval(() => {}, 1000)"],
      }),
    ]);

    await manager.startAll();
    const started = await waitFor(() => manager.getServicePids().length === 1);
    expect(started).toBe(true);

    await manager.restartSelected();

    expect(manager.getSelectedView()?.manualRestartCount).toBe(1);
    expect(manager.getSelectedView()?.restartCount).toBe(0);

    await manager.stopAll();
  });

  test("creates Process Claims before reporting running", async () => {
    const events: string[] = [];
    class TestClaims extends ProcessClaimStore {
      override async claimDirectManagedProcess(claim: ServicePid): Promise<void> {
        events.push(`claim:${claim.name}`);
      }
    }

    const manager = new ServiceManager([service({ name: "api", command: ["bun", "run", "dev"] })], {
      processClaimStore: new TestClaims(process.cwd()),
      launchAdapter: new LaunchInstructionExecutionAdapter({
        now: () => "now",
        pathReader: async () => process.env.PATH ?? "",
        processInfoReader: async (pid) => ({ pid, startedAt: "started", command: null }),
        spawner: () => ({
          pid: 10,
          stdout: null,
          stderr: null,
          exited: new Promise(() => {}),
          signalCode: null,
          kill: () => {},
        }),
      }),
    });
    manager.onProcessChange(() => {
      if (manager.getSelectedView()?.state === "RUNNING") events.push("running");
    });

    await manager.startAll();

    expect(events).toEqual(["claim:api", "running"]);
  });

  test("stops spawned process and reports failed state when Process Claim creation fails", async () => {
    const killed: NodeJS.Signals[] = [];
    class FailingClaims extends ProcessClaimStore {
      override async claimDirectManagedProcess(): Promise<void> {
        throw new Error("claim failed");
      }
    }

    const manager = new ServiceManager([service({ name: "api", command: ["bun", "run", "dev"] })], {
      processClaimStore: new FailingClaims(process.cwd()),
      launchAdapter: new LaunchInstructionExecutionAdapter({
        now: () => "now",
        pathReader: async () => process.env.PATH ?? "",
        processInfoReader: async (pid) => ({ pid, startedAt: "started", command: null }),
        spawner: () => ({
          pid: 11,
          stdout: null,
          stderr: null,
          exited: new Promise(() => {}),
          signalCode: null,
          kill: (signal) => killed.push(signal),
        }),
      }),
    });

    await manager.startAll();

    expect(killed).toEqual(["SIGTERM"]);
    expect(manager.getSelectedView()?.state).toBe("FAILED");
    expect(manager.getSelectedView()?.log.all().at(-1)?.line).toBe("claim failed");
  });

  test("releases Process Claims on claim-relevant exit events", async () => {
    const released: string[] = [];
    class TestClaims extends ProcessClaimStore {
      override async claimDirectManagedProcess(): Promise<void> {}
      override async releaseDirectManagedProcess(claim: ServicePid): Promise<void> {
        released.push(claim.name);
      }
    }

    const manager = new ServiceManager([service({ name: "api", command: ["bun", "run", "dev"] })], {
      processClaimStore: new TestClaims(process.cwd()),
      launchAdapter: new LaunchInstructionExecutionAdapter({
        now: () => "now",
        pathReader: async () => process.env.PATH ?? "",
        processInfoReader: async (pid) => ({ pid, startedAt: "started", command: null }),
        spawner: () => ({
          pid: 12,
          stdout: null,
          stderr: null,
          exited: Promise.resolve(0),
          signalCode: null,
          kill: () => {},
        }),
      }),
    });

    await manager.startAll();
    await waitFor(() => released.length === 1);

    expect(released).toEqual(["api"]);
  });
});
