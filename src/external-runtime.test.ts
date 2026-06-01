import { describe, expect, test } from "bun:test";
import {
  ExternalRuntimeVisibilityManager,
  detectExternalRuntimes,
  type ExternalRuntime,
  type ExternalRuntimeAdapter,
} from "./external-runtime";
import type { ExternalManagedProcess, LogEntry } from "./types";

const process = (runtimeId: string, name: string): ExternalManagedProcess => ({
  runtimeId,
  runtimeName: runtimeId,
  name,
  state: "running",
  status: "Up",
  ports: "",
});

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
