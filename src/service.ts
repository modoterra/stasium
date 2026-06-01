import {
  LaunchInstructionExecutionAdapter,
  type LaunchExecutionEvent,
  type LaunchExecutionHandle,
} from "./launch-execution";
import { resolveRuntimeWorkingDir } from "./process-info";
import { ProcessClaimStore } from "./process-claim";
import type { LogEntry, ServiceConfig, ServicePid, ServiceState } from "./types";

export type ServiceEvent =
  | { type: "state"; state: ServiceState }
  | { type: "log"; entry: LogEntry }
  | { type: "exit"; code: number | null; signal: string | null };

type ServiceSubscriber = (event: ServiceEvent) => void;

// Full process-tree cleanup relies on Unix process groups. Windows falls back to the direct child.
const SHOULD_DETACH_PROCESS_GROUP = process.platform !== "win32";

export class ServiceProcess {
  readonly config: ServiceConfig;
  private readonly detached = SHOULD_DETACH_PROCESS_GROUP;
  private readonly workingDir: string;
  private readonly launchAdapter: LaunchInstructionExecutionAdapter;
  private readonly processClaimStore: ProcessClaimStore | null;
  private state: ServiceState = "STOPPED";
  private launchHandle: LaunchExecutionHandle | null = null;
  private subscribers: Set<ServiceSubscriber> = new Set();
  private lastExitCode: number | null = null;
  private lastSignal: string | null = null;
  private stopRequested = false;
  private command: string[] = [];
  private startedAt: string | null = null;
  private identityVerified = false;
  private activeClaim: ServicePid | null = null;

  constructor(
    config: ServiceConfig,
    launchAdapter = new LaunchInstructionExecutionAdapter(),
    processClaimStore: ProcessClaimStore | null = null,
  ) {
    this.config = config;
    this.workingDir = resolveRuntimeWorkingDir(config.working_dir);
    this.launchAdapter = launchAdapter;
    this.processClaimStore = processClaimStore;
  }

  subscribe(handler: ServiceSubscriber): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  getState(): ServiceState {
    return this.state;
  }

  getLastExitCode(): number | null {
    return this.lastExitCode;
  }

  getLastSignal(): string | null {
    return this.lastSignal;
  }

  getPid(): number | null {
    return this.launchHandle?.pid ?? null;
  }

  getPidInfo(): ServicePid | null {
    const pid = this.launchHandle?.pid;
    if (!pid || !this.startedAt || this.command.length === 0) return null;
    return {
      name: this.config.name,
      pid,
      command: [...this.command],
      workingDir: this.workingDir,
      startedAt: this.startedAt,
      identityVerified: this.identityVerified,
    };
  }

  isRunning(): boolean {
    return this.launchHandle !== null;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.stopRequested = false;
    this.command = [];
    this.startedAt = null;
    this.identityVerified = false;
    this.activeClaim = null;
    this.setState("STARTING");

    const argv = this.config.command;
    this.command = [...argv];
    const launchHandle = await this.launchAdapter.start(
      {
        argv,
        workingDir: this.workingDir,
        env: this.config.env,
        detached: this.detached,
      },
      (event) => this.handleLaunchEvent(event),
    );
    if (launchHandle && this.state === "RUNNING") {
      this.launchHandle = launchHandle;
    }
  }

  block(reason: string): void {
    if (this.isRunning()) return;
    this.emit({
      type: "log",
      entry: { timestamp: new Date().toISOString(), line: reason, stream: "stderr" },
    });
    this.setState("BLOCKED");
  }

  async stop(signal: NodeJS.Signals = "SIGINT"): Promise<void> {
    if (!this.launchHandle) {
      this.setState("STOPPED");
      return;
    }
    this.stopRequested = true;
    this.setState("STOPPING");
    try {
      this.launchHandle.signal(signal);
    } catch {
      this.setState("STOPPED");
    }
  }

  async forceStop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    if (!this.launchHandle) {
      this.setState("STOPPED");
      return;
    }
    this.stopRequested = true;
    this.setState("STOPPING");
    try {
      this.launchHandle.signal(signal);
    } catch {
      this.setState("STOPPED");
    }
  }

  private async handleLaunchEvent(event: LaunchExecutionEvent): Promise<void> {
    if (event.type === "started") {
      this.startedAt = event.startedAt;
      this.identityVerified = event.identityVerified;
      const claim = this.buildPidInfo(event.pid);
      await this.processClaimStore?.claimDirectManagedProcess(claim);
      this.activeClaim = claim;
      this.setState("RUNNING");
      return;
    }

    if (event.type === "output") {
      this.emit({ type: "log", entry: event.entry });
      return;
    }

    if (event.type === "spawn-failed" || event.type === "start-rejected") {
      this.lastExitCode = 1;
      this.lastSignal = null;
      this.setState("FAILED");
      return;
    }

    this.lastExitCode = event.code;
    this.lastSignal = event.signal;
    const claim = this.activeClaim;
    this.launchHandle = null;
    this.activeClaim = null;
    if (this.stopRequested || event.code === 0) {
      this.setState("STOPPED");
    } else {
      this.setState("FAILED");
    }
    this.emit({ type: "exit", code: event.code, signal: event.signal });
    if (claim) void this.processClaimStore?.releaseDirectManagedProcess(claim);
  }

  private buildPidInfo(pid: number): ServicePid {
    return {
      name: this.config.name,
      pid,
      command: [...this.command],
      workingDir: this.workingDir,
      startedAt: this.startedAt ?? "",
      identityVerified: this.identityVerified,
    };
  }

  private setState(state: ServiceState) {
    if (this.state === state) return;
    this.state = state;
    this.emit({ type: "state", state });
  }

  private emit(event: ServiceEvent) {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }
}
