import { describe, expect, test } from "bun:test";
import {
  ExternalRuntimeVisibilityManager,
  detectExternalRuntimes,
  type ExternalRuntime,
  type ExternalRuntimeAdapter,
} from "./external-runtime";
import type { ExternalManagedProcess, LogEntry } from "./types";

describe("detectExternalRuntimes", () => {
  test("asks each External Runtime Adapter whether it is available for the Project", async () => {
    const asked: string[] = [];
    const availableRuntime = runtime("docker", [process("docker", "db")]);
    const adapters: ExternalRuntimeAdapter[] = [
      {
        id: "docker",
        name: "Docker Compose",
        detect: async (cwd) => {
          asked.push(`docker:${cwd}`);
          return availableRuntime;
        },
      },
      {
        id: "other",
        name: "Other Runtime",
        detect: async (cwd) => {
          asked.push(`other:${cwd}`);
          return null;
        },
      },
    ];

    const detected = await detectExternalRuntimes("/project", adapters);

    expect(asked).toEqual(["docker:/project", "other:/project"]);
    expect(detected).toEqual([availableRuntime]);
  });
});

describe("ExternalRuntimeVisibilityManager", () => {
  test("builds a Workspace snapshot from multiple External Runtimes", async () => {
    const manager = new ExternalRuntimeVisibilityManager([
      runtime("docker", [process("docker", "db")]),
      runtime("podman", [process("podman", "cache")]),
    ]);

    await manager.refresh();

    expect(manager.getProcesses().map((entry) => `${entry.runtimeId}:${entry.name}`)).toEqual([
      "docker:db",
      "podman:cache",
    ]);
  });

  test("keeps available External Runtime snapshots when another runtime fails", async () => {
    const manager = new ExternalRuntimeVisibilityManager([
      runtime("docker", [process("docker", "db")]),
      {
        ...runtime("podman", []),
        snapshot: async () => {
          throw new Error("runtime unavailable");
        },
      },
    ]);

    await manager.refresh();

    expect(manager.getProcesses().map((entry) => `${entry.runtimeId}:${entry.name}`)).toEqual([
      "docker:db",
    ]);
  });

  test("exposes refreshed snapshots without requiring selection state", async () => {
    let processes = [process("docker", "db")];
    const manager = new ExternalRuntimeVisibilityManager([
      runtime("docker", processes),
      runtime("podman", [process("podman", "cache")]),
    ]);

    await manager.refresh();
    processes.splice(0, processes.length, process("docker", "api"));
    await manager.refresh();

    expect(manager.getProcesses().map((entry) => `${entry.runtimeId}:${entry.name}`)).toEqual([
      "docker:api",
      "podman:cache",
    ]);
  });

  test("preserves selected External Managed Process by snapshot key", async () => {
    let processes = [process("docker", "db"), process("docker", "api")];
    const manager = new ExternalRuntimeVisibilityManager([runtime("docker", processes)]);
    await manager.refresh();
    manager.setSelectedIndex(1);

    processes.splice(0, processes.length, process("docker", "api"), process("docker", "db"));
    await manager.refresh();

    expect(manager.getSelectedIndex()).toBe(0);
    expect(manager.getSelectedProcess()?.name).toBe("api");
  });

  test("forwards selected lifecycle actions to the owning External Runtime", async () => {
    const actions: string[] = [];
    const manager = new ExternalRuntimeVisibilityManager([
      runtime("docker", [process("docker", "db")], actions),
      runtime("podman", [process("podman", "cache")], actions),
    ]);
    await manager.refresh();
    manager.selectIndex(1);

    await manager.restartSelected();

    expect(actions).toEqual(["podman:restart:cache"]);
  });

  test("streams selected External Process Output through the active log buffer", async () => {
    let emit = (_entry: LogEntry): void => {};
    const testRuntime = runtime("docker", [process("docker", "db")]);
    testRuntime.streamOutput = (name, onOutput) => {
      emit = onOutput;
      return { stop: () => {} };
    };
    const manager = new ExternalRuntimeVisibilityManager([testRuntime]);

    await manager.refresh();
    manager.streamSelectedLogs();
    emit({ timestamp: "2026-06-01T12:00:00Z", line: "ready", stream: "stdout" });

    expect(manager.getActiveLogBuffer()?.all()).toEqual([
      { timestamp: "2026-06-01T12:00:00Z", line: "ready", stream: "stdout" },
    ]);
    expect(manager.getSelectedLogBuffer()?.all()).toEqual([
      { timestamp: "2026-06-01T12:00:00Z", line: "ready", stream: "stdout" },
    ]);
  });

  test("stops previous External Process Output stream when selection changes", async () => {
    const actions: string[] = [];
    const testRuntime = runtime("docker", [process("docker", "db"), process("docker", "cache")]);
    testRuntime.streamOutput = (name) => {
      actions.push(`stream:${name}`);
      return { stop: () => actions.push(`stop:${name}`) };
    };
    const manager = new ExternalRuntimeVisibilityManager([testRuntime]);

    await manager.refresh();
    manager.selectIndex(1);

    expect(actions).toEqual(["stream:db", "stop:db", "stream:cache"]);
  });

  test("tracks and stops External Managed Processes auto-started for Startup Dependencies", async () => {
    const actions: string[] = [];
    let state: ExternalManagedProcess["state"] = "exited";
    const testRuntime = runtime("docker", [process("docker", "db")], actions);
    testRuntime.snapshot = async () => [process("docker", "db", state)];
    testRuntime.start = async (name) => {
      actions.push(`docker:start:${name}`);
      state = "running";
    };
    const manager = new ExternalRuntimeVisibilityManager([testRuntime]);

    await manager.ensureProcessAvailable("db");
    await manager.stopSessionStartedProcesses();

    expect(actions).toEqual(["docker:start:db", "docker:stop:db"]);
  });

  test("does not stop manually started External Managed Processes during session cleanup", async () => {
    const actions: string[] = [];
    let state: ExternalManagedProcess["state"] = "exited";
    const testRuntime = runtime("docker", [process("docker", "db")], actions);
    testRuntime.snapshot = async () => [process("docker", "db", state)];
    testRuntime.start = async (name) => {
      actions.push(`docker:start:${name}`);
      state = "running";
    };
    const manager = new ExternalRuntimeVisibilityManager([testRuntime]);

    await manager.refresh();
    await manager.start("db");
    await manager.stopSessionStartedProcesses();

    expect(actions).toEqual(["docker:start:db"]);
  });

  test("reports failed External Runtime Session stop requests without throwing", async () => {
    const messages: string[] = [];
    let state: ExternalManagedProcess["state"] = "exited";
    const testRuntime = runtime("docker", [process("docker", "db")]);
    testRuntime.snapshot = async () => [process("docker", "db", state)];
    testRuntime.start = async () => {
      state = "running";
    };
    testRuntime.stop = async () => {
      throw new Error("stop failed");
    };
    const manager = new ExternalRuntimeVisibilityManager([testRuntime]);

    await manager.ensureProcessAvailable("db");
    await manager.stopSessionStartedProcesses((message) => messages.push(message));

    expect(messages).toEqual(['External Runtime cleanup warning for "docker:db": stop failed']);
  });
});

const runtime = (
  id: string,
  processes: ExternalManagedProcess[],
  actions: string[] = [],
): ExternalRuntime => ({
  id,
  name: id,
  snapshot: async () => processes,
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

const process = (
  runtimeId: string,
  name: string,
  state: ExternalManagedProcess["state"] = "running",
): ExternalManagedProcess => ({
  runtimeId,
  runtimeName: runtimeId,
  name,
  state,
  status: "Up",
  ports: "",
});
