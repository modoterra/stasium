import { readLiveProcessInfo, type LiveProcessInfo } from "./process-info";
import type { LogEntry } from "./types";

export type LaunchExecutionEvent =
  | {
      type: "started";
      pid: number;
      startedAt: string;
      identityVerified: boolean;
    }
  | { type: "output"; entry: LogEntry }
  | { type: "spawn-failed"; message: string }
  | { type: "start-rejected"; message: string }
  | { type: "exit"; code: number | null; signal: string | null };

export interface LaunchInstructionInput {
  argv: string[];
  workingDir: string;
  env: Record<string, string>;
  detached?: boolean;
}

export interface LaunchExecutionHandle {
  pid: number;
  signal: (signal: NodeJS.Signals) => void;
}

type LaunchEventHandler = (event: LaunchExecutionEvent) => Promise<void> | void;
type PathReader = (cwd: string) => Promise<string | null>;
type ProcessInfoReader = (pid: number) => Promise<LiveProcessInfo | null>;
type SignalProcessGroup = (pid: number, signal: NodeJS.Signals) => boolean;

type AdapterSubprocess = {
  pid: number;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number | null>;
  signalCode?: string | null;
  kill: (signal: NodeJS.Signals) => void;
};

type SpawnOptions = {
  cmd: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  detached: boolean;
  stdout: "pipe";
  stderr: "pipe";
};

type Spawner = (options: SpawnOptions) => AdapterSubprocess;

interface LaunchInstructionExecutionAdapterOptions {
  now?: () => string;
  pathReader?: PathReader;
  processInfoReader?: ProcessInfoReader;
  signalProcessGroup?: SignalProcessGroup;
  spawner?: Spawner;
}

const lineDecoder = new TextDecoder();

const timestamp = (): string => new Date().toISOString();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

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

const readPathFromShell = async (cwd: string): Promise<string | null> => {
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

const spawnWithBun: Spawner = (options) =>
  Bun.spawn({
    cmd: options.cmd,
    cwd: options.cwd,
    env: options.env,
    detached: options.detached,
    stdout: options.stdout,
    stderr: options.stderr,
  });

const signalUnixProcessGroup: SignalProcessGroup = (pid, signal) => {
  if (process.platform === "win32") return false;
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === "ESRCH";
  }
};

export class LaunchInstructionExecutionAdapter {
  private cachedPath: string | null = null;
  private pathRefreshPromise: Promise<string> | null = null;
  private readonly now: () => string;
  private readonly pathReader: PathReader;
  private readonly processInfoReader: ProcessInfoReader;
  private readonly signalProcessGroup: SignalProcessGroup;
  private readonly spawner: Spawner;

  constructor(options: LaunchInstructionExecutionAdapterOptions = {}) {
    this.now = options.now ?? timestamp;
    this.pathReader = options.pathReader ?? readPathFromShell;
    this.processInfoReader = options.processInfoReader ?? readLiveProcessInfo;
    this.signalProcessGroup = options.signalProcessGroup ?? signalUnixProcessGroup;
    this.spawner = options.spawner ?? spawnWithBun;
  }

  async start(
    input: LaunchInstructionInput,
    onEvent: LaunchEventHandler,
  ): Promise<LaunchExecutionHandle | null> {
    const env = await this.buildSpawnEnv(input.workingDir, input.env);
    let proc: AdapterSubprocess;

    try {
      proc = this.spawner({
        cmd: input.argv,
        cwd: input.workingDir,
        env,
        detached: input.detached ?? false,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      await onEvent({ type: "spawn-failed", message });
      await onEvent({
        type: "output",
        entry: { timestamp: this.now(), line: message, stream: "stderr" },
      });
      return null;
    }

    const processInfo = await this.processInfoReader(proc.pid);
    try {
      await onEvent({
        type: "started",
        pid: proc.pid,
        startedAt: processInfo?.startedAt ?? this.now(),
        identityVerified: processInfo !== null,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      proc.kill("SIGTERM");
      await onEvent({ type: "start-rejected", message });
      await onEvent({
        type: "output",
        entry: { timestamp: this.now(), line: message, stream: "stderr" },
      });
      return null;
    }

    this.attachStream(proc.stdout, "stdout", onEvent);
    this.attachStream(proc.stderr, "stderr", onEvent);
    void proc.exited
      .then((code) => {
        onEvent({ type: "exit", code, signal: proc.signalCode ?? null });
      })
      .catch((error) => {
        onEvent({
          type: "output",
          entry: { timestamp: this.now(), line: getErrorMessage(error), stream: "stderr" },
        });
      });

    return {
      pid: proc.pid,
      signal: (signal) => {
        if (input.detached && this.signalProcessGroup(proc.pid, signal)) return;
        proc.kill(signal);
      },
    };
  }

  private async getFreshPath(cwd: string): Promise<string> {
    if (this.cachedPath !== null) return this.cachedPath;
    if (this.pathRefreshPromise) return this.pathRefreshPromise;

    this.pathRefreshPromise = (async () => {
      const freshPath = await this.pathReader(cwd);
      this.cachedPath = freshPath ?? process.env.PATH ?? "";
      return this.cachedPath;
    })();

    try {
      return await this.pathRefreshPromise;
    } finally {
      this.pathRefreshPromise = null;
    }
  }

  private async buildSpawnEnv(
    cwd: string,
    overrides: Record<string, string>,
  ): Promise<NodeJS.ProcessEnv> {
    const freshPath = await this.getFreshPath(cwd);
    return { ...process.env, PATH: freshPath, ...overrides };
  }

  private attachStream(
    stream: ReadableStream<Uint8Array> | null,
    source: "stdout" | "stderr",
    onEvent: LaunchEventHandler,
  ): void {
    if (!stream) return;
    const reader = stream.getReader();
    let remainder = "";

    const readLoop = async () => {
      while (true) {
        const result = await reader.read();
        if (result.done) break;

        remainder += lineDecoder.decode(result.value);
        const lines = splitLines(remainder);
        remainder = lines.rest;

        for (const line of lines.lines) {
          onEvent({
            type: "output",
            entry: { timestamp: this.now(), line, stream: source },
          });
        }
      }

      if (remainder.length > 0) {
        onEvent({
          type: "output",
          entry: { timestamp: this.now(), line: remainder, stream: source },
        });
      }
    };

    void readLoop().catch((error) => {
      onEvent({
        type: "output",
        entry: { timestamp: this.now(), line: getErrorMessage(error), stream: "stderr" },
      });
    });
  }
}
