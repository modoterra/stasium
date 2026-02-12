import { normalizeCommand } from "./command";
import type { CommandSpec, LogEntry, ServiceConfig, ServiceState } from "./types";

export type ServiceEvent =
  | { type: "state"; state: ServiceState }
  | { type: "log"; entry: LogEntry }
  | { type: "exit"; code: number | null; signal: string | null };

type ServiceSubscriber = (event: ServiceEvent) => void;

const timestamp = (): string => new Date().toISOString();

const lineDecoder = new TextDecoder();

const splitLines = (buffer: string): { lines: string[]; rest: string } => {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
};

export class ServiceProcess {
  readonly config: ServiceConfig;
  private state: ServiceState = "STOPPED";
  private process: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;
  private subscribers: Set<ServiceSubscriber> = new Set();
  private lastExitCode: number | null = null;
  private lastSignal: string | null = null;
  private stopRequested = false;
  private stdoutRemainder = "";
  private stderrRemainder = "";

  constructor(config: ServiceConfig) {
    this.config = config;
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

  isRunning(): boolean {
    return this.process !== null;
  }

  async start(): Promise<void> {
    if (this.isRunning()) return;
    this.stopRequested = false;
    this.setState("STARTING");

    let argv: string[];
    try {
      argv = normalizeCommand(this.config.command as CommandSpec);
    } catch (error) {
      this.lastExitCode = 1;
      this.lastSignal = null;
      this.setState("FAILED");
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: message, stream: "stderr" },
      });
      return;
    }

    try {
      this.process = Bun.spawn({
        cmd: argv,
        cwd: this.config.working_dir,
        env: this.config.env ? { ...process.env, ...this.config.env } : process.env,
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      this.lastExitCode = 1;
      this.lastSignal = null;
      this.setState("FAILED");
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: message, stream: "stderr" },
      });
      return;
    }

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
        const message = error instanceof Error ? error.message : String(error);
        this.emit({
          type: "log",
          entry: { timestamp: timestamp(), line: message, stream: "stderr" },
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
      this.process.kill(signal);
    } catch {
      this.setState("STOPPED");
    }
  }

  async forceStop(): Promise<void> {
    if (!this.process) {
      this.setState("STOPPED");
      return;
    }
    this.stopRequested = true;
    this.setState("STOPPING");
    try {
      this.process.kill("SIGTERM");
    } catch {
      this.setState("STOPPED");
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
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "log",
        entry: { timestamp: timestamp(), line: message, stream: "stderr" },
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
