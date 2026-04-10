import { readLiveProcessInfo, resolveRuntimeWorkingDir } from "./process-info";
import { normalizeCommand } from "./command";
import { getErrorMessage } from "./shared";
import type { CommandSpec, LogEntry, ServiceConfig, ServicePid, ServiceState } from "./types";

export type ServiceEvent =
  | { type: "state"; state: ServiceState }
  | { type: "log"; entry: LogEntry }
  | { type: "exit"; code: number | null; signal: string | null };

type ServiceSubscriber = (event: ServiceEvent) => void;

const timestamp = (): string => new Date().toISOString();

const lineDecoder = new TextDecoder();
// Full process-tree cleanup relies on Unix process groups. Windows falls back to the direct child.
const SHOULD_DETACH_PROCESS_GROUP = process.platform !== "win32";

const splitLines = (buffer: string): { lines: string[]; rest: string } => {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
};

const resolveShell = (): string => {
  const shell = process.env.SHELL;
  if (shell && shell.trim().length > 0) return shell;
  return "/bin/sh";
};

let pathRefreshPromise: Promise<string> | null = null;

const readPathFromShell = async (cwd?: string): Promise<string | null> => {
  try {
    const proc = Bun.spawn({
      cmd: [resolveShell(), "-lc", "printenv PATH"],
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const freshPath = output.trim();
    return freshPath.length > 0 ? freshPath : null;
  } catch {
    return null;
  }
};

const getFreshPath = async (cwd?: string): Promise<string> => {
  if (pathRefreshPromise) return pathRefreshPromise;
  pathRefreshPromise = (async () => {
    const freshPath = await readPathFromShell(cwd);
    if (freshPath) {
      process.env.PATH = freshPath;
      return freshPath;
    }
    return process.env.PATH ?? "";
  })();
  try {
    return await pathRefreshPromise;
  } finally {
    pathRefreshPromise = null;
  }
};

const buildSpawnEnv = async (
  cwd: string | undefined,
  overrides?: Record<string, string>,
): Promise<NodeJS.ProcessEnv> => {
  const freshPath = await getFreshPath(cwd);
  const baseEnv: NodeJS.ProcessEnv = { ...process.env, PATH: freshPath };
  return overrides ? { ...baseEnv, ...overrides } : baseEnv;
};

export class ServiceProcess {
  readonly config: ServiceConfig;
  private readonly detached = SHOULD_DETACH_PROCESS_GROUP;
  private readonly workingDir: string;
  private state: ServiceState = "STOPPED";
  private process: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;
  private subscribers: Set<ServiceSubscriber> = new Set();
  private lastExitCode: number | null = null;
  private lastSignal: string | null = null;
  private stopRequested = false;
  private command: string[] = [];
  private startedAt: string | null = null;
  private identityVerified = false;
  private stdoutRemainder = "";
  private stderrRemainder = "";

  constructor(config: ServiceConfig) {
    this.config = config;
    this.workingDir = resolveRuntimeWorkingDir(config.working_dir);
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
    return this.process?.pid ?? null;
  }

  getPidInfo(): ServicePid | null {
    const pid = this.process?.pid;
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
    return this.process !== null;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.stopRequested = false;
    this.command = [];
    this.startedAt = null;
    this.identityVerified = false;
    this.setState("STARTING");

    let argv: string[];
    try {
      argv = normalizeCommand(this.config.command as CommandSpec);
      this.command = [...argv];
    } catch (error) {
      this.lastExitCode = 1;
      this.lastSignal = null;
      this.setState("FAILED");
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: getErrorMessage(error), stream: "stderr" },
      });
      return;
    }

    try {
      const env = await buildSpawnEnv(this.config.working_dir, this.config.env);
      this.process = Bun.spawn({
        cmd: argv,
        cwd: this.config.working_dir,
        env,
        detached: this.detached,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      this.lastExitCode = 1;
      this.lastSignal = null;
      this.setState("FAILED");
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: getErrorMessage(error), stream: "stderr" },
      });
      return;
    }

    const processInfo = await readLiveProcessInfo(this.process.pid);
    this.startedAt = processInfo?.startedAt ?? timestamp();
    this.identityVerified = processInfo !== null;
    this.setState("RUNNING");
    this.attachStream(this.process.stdout, "stdout");
    this.attachStream(this.process.stderr, "stderr");
    this.process.exited
      .then((code) => {
        this.lastExitCode = code;
        this.lastSignal = this.process?.signalCode ?? null;
        this.process = null;
        if (this.stopRequested) {
          this.setState("STOPPED");
        } else if (code === 0) {
          this.setState("STOPPED");
        } else {
          this.setState("FAILED");
        }
        this.emit({ type: "exit", code, signal: this.lastSignal });
      })
      .catch((error) => {
        this.emit({
          type: "log",
          entry: { timestamp: timestamp(), line: getErrorMessage(error), stream: "stderr" },
        });
        this.setState("FAILED");
      });
  }

  async stop(signal: NodeJS.Signals = "SIGINT"): Promise<void> {
    if (!this.process) {
      this.setState("STOPPED");
      return;
    }
    this.stopRequested = true;
    this.setState("STOPPING");
    try {
      this.signalProcess(signal);
    } catch {
      this.setState("STOPPED");
    }
  }

  async forceStop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    if (!this.process) {
      this.setState("STOPPED");
      return;
    }
    this.stopRequested = true;
    this.setState("STOPPING");
    try {
      this.signalProcess(signal);
    } catch {
      this.setState("STOPPED");
    }
  }

  private signalProcess(signal: NodeJS.Signals): void {
    const processHandle = this.process;
    if (!processHandle) return;

    if (this.signalProcessGroup(processHandle.pid, signal)) return;
    processHandle.kill(signal);
  }

  private signalProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
    if (!this.detached) return false;
    if (!Number.isInteger(pid) || pid <= 0) return false;

    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ESRCH") {
        return true;
      }
      return false;
    }
  }

  private attachStream(stream: ReadableStream<Uint8Array> | null, source: "stdout" | "stderr") {
    if (!stream) return;
    const reader = stream.getReader();
    const readLoop = async () => {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = lineDecoder.decode(result.value);
        this.appendChunk(source, chunk);
      }
      this.flushRemainder(source);
    };
    readLoop().catch((error) => {
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: getErrorMessage(error), stream: "stderr" },
      });
    });
  }

  private appendChunk(source: "stdout" | "stderr", chunk: string) {
    if (source === "stdout") {
      this.stdoutRemainder += chunk;
      const { lines, rest } = splitLines(this.stdoutRemainder);
      this.stdoutRemainder = rest;
      for (const line of lines) {
        this.emit({
          type: "log",
          entry: { timestamp: timestamp(), line, stream: source },
        });
      }
      return;
    }

    this.stderrRemainder += chunk;
    const { lines, rest } = splitLines(this.stderrRemainder);
    this.stderrRemainder = rest;
    for (const line of lines) {
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line, stream: source },
      });
    }
  }

  private flushRemainder(source: "stdout" | "stderr") {
    const remainder = source === "stdout" ? this.stdoutRemainder : this.stderrRemainder;
    if (remainder.length === 0) return;
    if (source === "stdout") {
      this.stdoutRemainder = "";
    } else {
      this.stderrRemainder = "";
    }
    this.emit({
      type: "log",
      entry: { timestamp: timestamp(), line: remainder, stream: source },
    });
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
