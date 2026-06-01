import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveManifest } from "./manifest";
import { normalizeProcessDefinition } from "./process-definition";
import { startWorkspace } from "./workspace-startup";
import type { ExternalRuntime, ExternalRuntimeAdapter } from "./external-runtime";
import type { ExternalManagedProcess, LogEntry } from "./types";

describe("startWorkspace", () => {
  test("mounts the Workspace before Startup while External Runtime polling continues", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-workspace-"));
    const manifestPath = join(dir, "stasium.toml");
    const events: string[] = [];
    try {
      await saveManifest(manifestPath, []);
      const adapter: ExternalRuntimeAdapter = {
        id: "docker",
        name: "Docker Compose",
        detect: async () => {
          events.push("detect external runtimes");
          return externalRuntime(events);
        },
      };

      const session = await startWorkspace({
        cwd: dir,
        manifestPath,
        runtime: { closing: false, disposed: false },
        externalRuntimeAdapters: [adapter],
        mountWorkspace: () => {
          events.push("mount workspace");
        },
      });
      await session.startup;
      expect(session.externalRuntimeManager?.getProcesses()).toEqual([externalProcess()]);
      await session.externalRuntimeManager?.restartSelected();
      session.externalRuntimeManager?.streamSelectedLogs();
      await session.shutdown.run();
      await session.externalRuntimeManager?.destroy();

      expect(events.slice(0, 3)).toEqual([
        "detect external runtimes",
        "mount workspace",
        "poll external runtime",
      ]);
      expect(events).toContain("restart external process:db");
      expect(events).toContain("stream external output:db");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("runs Startup after mounting so Process State can update live", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-workspace-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      await saveManifest(manifestPath, [
        normalizeProcessDefinition({
          name: "api",
          launchInstruction: ["bun", "-e", "setInterval(() => {}, 1000)"],
        }),
      ]);

      const session = await startWorkspace({
        cwd: dir,
        manifestPath,
        runtime: { closing: false, disposed: false },
        externalRuntimeVisibilityEnabled: () => false,
        mountWorkspace: (context) => {
          expect(context.manager.getSelectedView()?.state).toBe("STOPPED");
        },
      });

      await session.startup;
      expect(session.manager.getSelectedView()?.state).toBe("RUNNING");
      await session.shutdown.run();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const externalRuntime = (events: string[]): ExternalRuntime => ({
  id: "docker",
  name: "Docker Compose",
  snapshot: async () => {
    events.push("poll external runtime");
    return [externalProcess()];
  },
  isAvailable: (process) => process.state === "running",
  start: async () => {},
  stop: async () => {},
  restart: async (name) => {
    events.push(`restart external process:${name}`);
  },
  streamOutput: (name: string, _onOutput: (entry: LogEntry) => void) => {
    events.push(`stream external output:${name}`);
    return { stop: () => {} };
  },
  destroy: async () => {},
});

const externalProcess = (): ExternalManagedProcess => ({
  runtimeId: "docker",
  runtimeName: "Docker Compose",
  name: "db",
  state: "running",
  status: "Up",
  ports: "",
});
