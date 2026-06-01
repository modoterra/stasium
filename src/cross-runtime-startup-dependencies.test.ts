import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExternalRuntimeVisibilityManager, type ExternalRuntime } from "./external-runtime";
import { LaunchInstructionExecutionAdapter } from "./launch-execution";
import { addProcessDefinition } from "./manifest-editing";
import { loadManifest, saveManifest } from "./manifest";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager } from "./service-manager";
import { normalizeProcessDefinition } from "./process-definition";
import type { ExternalManagedProcess, LogEntry, ServicePid } from "./types";

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
  claims: string[] = [];

  override async claimDirectManagedProcess(claim: ServicePid): Promise<void> {
    this.claims.push(claim.name);
  }
}

describe("cross-runtime Startup Dependencies", () => {
  test("loads existing Manifest syntax when External Runtime Visibility satisfies it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-cross-runtime-"));
    const manifestPath = join(dir, "stasium.toml");
    await Bun.write(
      manifestPath,
      [
        "[[service]]",
        'name = "api"',
        'command = ["bun", "run", "dev"]',
        'depends_on = ["docker-compose:db"]',
      ].join("\n"),
    );

    try {
      const manifest = await loadManifest(manifestPath, {
        externalManagedProcessNames: ["docker-compose:db"],
      });

      expect(manifest.services[0]?.startupDependencies).toEqual(["docker-compose:db"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("edits Manifests with External Runtime Visibility without syntax changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-cross-runtime-"));
    const manifestPath = join(dir, "stasium.toml");

    try {
      await saveManifest(manifestPath, []);
      const claims = new TestClaims(dir);
      const externalRuntimeManager = new ExternalRuntimeVisibilityManager([
        externalRuntime(() => [externalProcess("db", "running")]),
      ]);
      await externalRuntimeManager.refresh();
      const manager = new ServiceManager([], { processClaimStore: claims, externalRuntimeManager });

      await addProcessDefinition(
        { manifestPath, manager, processClaimStore: claims, externalRuntimeManager },
        {
          name: "api",
          launchInstruction: "bun run dev",
          startupDependencies: ["docker-compose:db"],
        },
      );

      const manifest = await loadManifest(manifestPath, {
        externalManagedProcessNames: ["docker-compose:db"],
      });

      expect(manifest.services[0]?.startupDependencies).toEqual(["docker-compose:db"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("blocks Startup when a visible External Managed Process stays unavailable", async () => {
    const actions: string[] = [];
    const claims = new TestClaims(process.cwd());
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([
      externalRuntime(() => [externalProcess("db", "exited")], actions),
    ]);
    const manager = new ServiceManager(
      [
        normalizeProcessDefinition({
          name: "api",
          launchInstruction: "bun run dev",
          startupDependencies: ["docker-compose:db"],
        }),
      ],
      { externalRuntimeManager, launchAdapter: launchPid(40), processClaimStore: claims },
    );

    await manager.startAll();

    expect(actions).toEqual(["start:db"]);
    expect(manager.getSelectedView()?.state).toBe("BLOCKED");
    expect(manager.getServicePids()).toEqual([]);
    expect(claims.claims).toEqual([]);
    expect(manager.getSelectedView()?.log.all().at(-1)?.line).toBe(
      'Startup blocked by failed Startup Dependency "docker-compose:db".',
    );
  });

  test("claims only Direct Managed Processes when Startup starts an external dependency", async () => {
    const actions: string[] = [];
    let dbState: ExternalManagedProcess["state"] = "exited";
    const runtime = externalRuntime(() => [externalProcess("db", dbState)], actions);
    runtime.start = async (name) => {
      actions.push(`start:${name}`);
      dbState = "running";
    };
    const externalRuntimeManager = new ExternalRuntimeVisibilityManager([runtime]);
    const claims = new TestClaims(process.cwd());
    const manager = new ServiceManager(
      [
        normalizeProcessDefinition({
          name: "api",
          launchInstruction: "bun run dev",
          startupDependencies: ["docker-compose:db"],
        }),
      ],
      { externalRuntimeManager, launchAdapter: launchPid(41), processClaimStore: claims },
    );

    await manager.startAll();

    expect(actions).toEqual(["start:db"]);
    expect(claims.claims).toEqual(["api"]);
    expect(manager.getSelectedView()?.state).toBe("RUNNING");
  });
});
