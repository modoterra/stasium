import { LogBuffer } from "./log-buffer";
import { getErrorMessage } from "./shared";
import type { ExternalManagedProcess, LogEntry } from "./types";

export type ExternalRuntimeUpdateCallback = () => void;

export interface ExternalRuntimeOutputStream {
  stop: () => void;
}

export interface ExternalRuntime {
  id: string;
  name: string;
  snapshot: () => Promise<ExternalManagedProcess[]>;
  isAvailable: (process: ExternalManagedProcess) => boolean;
  start?: (name: string) => Promise<void>;
  stop: (name: string) => Promise<void>;
  restart: (name: string) => Promise<void>;
  streamOutput: (
    name: string,
    onOutput: (entry: LogEntry) => void,
  ) => ExternalRuntimeOutputStream | null;
  destroy: () => Promise<void>;
}

export interface ExternalRuntimeAdapter {
  id: string;
  name: string;
  detect: (cwd: string) => Promise<ExternalRuntime | null>;
}

const LOG_CAPACITY = 2000;

export const detectExternalRuntimes = async (
  cwd: string,
  adapters: ExternalRuntimeAdapter[],
): Promise<ExternalRuntime[]> => {
  const runtimes: ExternalRuntime[] = [];
  for (const adapter of adapters) {
    const runtime = await adapter.detect(cwd);
    if (runtime) runtimes.push(runtime);
  }
  return runtimes;
};

export class ExternalRuntimeVisibilityManager {
  private readonly runtimes: ExternalRuntime[];
  private processes: ExternalManagedProcess[] = [];
  private selectedIndex = 0;
  private readonly logs: Map<string, LogBuffer> = new Map();
  private readonly updateCallbacks: Set<ExternalRuntimeUpdateCallback> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private activeOutputStream: ExternalRuntimeOutputStream | null = null;
  private activeOutputKey: string | null = null;
  private readonly sessionStartedProcesses: Map<string, { runtimeId: string; name: string }> =
    new Map();

  constructor(runtimes: ExternalRuntime[]) {
    this.runtimes = runtimes;
  }

  onUpdate(callback: ExternalRuntimeUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  getProcesses(): ExternalManagedProcess[] {
    return [...this.processes];
  }

  getServices(): ExternalManagedProcess[] {
    return this.getProcesses();
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    const max = Math.max(0, this.processes.length - 1);
    const next = Math.min(Math.max(index, 0), max);
    if (next === this.selectedIndex) return;
    this.selectedIndex = next;
    this.notify();
  }

  moveSelection(delta: number): void {
    this.selectIndex(this.selectedIndex + delta);
  }

  selectIndex(index: number): void {
    this.setSelectedIndex(index);
    const selected = this.getSelectedProcess();
    const selectedKey = selected ? processKey(selected) : null;
    if (selected && selectedKey !== this.activeOutputKey) {
      this.streamOutput(selected);
    }
  }

  getSelectedProcess(): ExternalManagedProcess | null {
    return this.processes[this.selectedIndex] ?? null;
  }

  getSelectedService(): ExternalManagedProcess | null {
    return this.getSelectedProcess();
  }

  getLogBuffer(name: string): LogBuffer {
    let buffer = this.logs.get(name);
    if (!buffer) {
      buffer = new LogBuffer(LOG_CAPACITY);
      this.logs.set(name, buffer);
    }
    return buffer;
  }

  getSelectedLogBuffer(): LogBuffer | null {
    const process = this.getSelectedProcess();
    if (!process) return null;
    return this.getLogBuffer(processKey(process));
  }

  getActiveLogBuffer(): LogBuffer | null {
    if (!this.activeOutputKey) return null;
    return this.getLogBuffer(this.activeOutputKey);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    try {
      const previousProcess = this.getSelectedProcess();
      const previousKey = previousProcess ? processKey(previousProcess) : null;
      const snapshots = await Promise.all(
        this.runtimes.map(async (runtime) => {
          try {
            return await runtime.snapshot();
          } catch {
            return [];
          }
        }),
      );
      this.processes = snapshots.flat();

      if (previousKey !== null) {
        const restoredIndex = this.processes.findIndex(
          (process) => processKey(process) === previousKey,
        );
        this.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
      }

      const maxIndex = Math.max(0, this.processes.length - 1);
      if (this.selectedIndex > maxIndex) {
        this.selectedIndex = maxIndex;
      }

      const selected = this.getSelectedProcess();
      const selectedKey = selected ? processKey(selected) : null;
      if (selected && this.activeOutputKey !== selectedKey) {
        this.streamOutput(selected);
      }

      this.notify();
    } finally {
      this.refreshing = false;
    }
  }

  async start(name: string): Promise<void> {
    await this.withProcess(name, async (runtime, process) => {
      await runtime.start?.(process.name);
    });
    await this.refresh();
  }

  async ensureProcessAvailable(name: string): Promise<boolean> {
    await this.refresh();
    const process = this.findProcess(name);
    if (!process) return false;

    let runtime = this.runtimeFor(process.runtimeId);
    if (runtime.isAvailable(process)) return true;
    if (!runtime.start) return false;

    await runtime.start(process.name);
    await this.refresh();

    const updated = this.findProcess(name);
    if (!updated) return false;

    runtime = this.runtimeFor(updated.runtimeId);
    const available = runtime.isAvailable(updated);
    if (available) {
      this.sessionStartedProcesses.set(processKey(updated), {
        runtimeId: updated.runtimeId,
        name: updated.name,
      });
    }
    return available;
  }

  async stopSessionStartedProcesses(logger?: (message: string) => void): Promise<void> {
    const records = [...this.sessionStartedProcesses.entries()].reverse();
    for (const [key, record] of records) {
      try {
        await this.runtimeFor(record.runtimeId).stop(record.name);
        this.sessionStartedProcesses.delete(key);
      } catch (error) {
        logger?.(`External Runtime cleanup warning for "${key}": ${getErrorMessage(error)}`);
      }
    }
  }

  async stop(name: string): Promise<void> {
    await this.withProcess(name, (runtime, process) => runtime.stop(process.name));
    await this.refresh();
  }

  async restart(name: string): Promise<void> {
    await this.withProcess(name, (runtime, process) => runtime.restart(process.name));
    await this.refresh();
  }

  async startSelected(): Promise<void> {
    const process = this.getSelectedProcess();
    if (!process) return;
    await this.start(processKey(process));
    this.streamSelectedLogs();
  }

  async stopSelected(): Promise<void> {
    const process = this.getSelectedProcess();
    if (!process) return;
    await this.stop(processKey(process));
    this.streamSelectedLogs();
  }

  async restartSelected(): Promise<void> {
    const process = this.getSelectedProcess();
    if (!process) return;
    await this.restart(processKey(process));
    this.streamSelectedLogs();
  }

  streamSelectedLogs(): void {
    const process = this.getSelectedProcess();
    if (!process) return;
    this.streamOutput(process);
  }

  stopLogStream(): void {
    if (!this.activeOutputStream) return;
    this.activeOutputStream.stop();
    this.activeOutputStream = null;
    this.activeOutputKey = null;
  }

  startPolling(intervalMs = 3000): void {
    this.stopPolling();
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async destroy(): Promise<void> {
    this.stopPolling();
    this.stopLogStream();
    await Promise.all(this.runtimes.map((runtime) => runtime.destroy()));
  }

  private streamOutput(process: ExternalManagedProcess): void {
    this.stopLogStream();
    const key = processKey(process);
    const buffer = this.getLogBuffer(key);
    buffer.clear();
    this.notify();

    const runtime = this.runtimeFor(process.runtimeId);
    const stream = runtime.streamOutput(process.name, (entry) => {
      buffer.add(entry);
      this.notify();
    });
    this.activeOutputStream = stream;
    this.activeOutputKey = stream ? key : null;
  }

  private async withProcess(
    key: string,
    action: (runtime: ExternalRuntime, process: ExternalManagedProcess) => Promise<void>,
  ): Promise<void> {
    const process = this.findProcess(key);
    if (!process) return;
    await action(this.runtimeFor(process.runtimeId), process);
  }

  private findProcess(name: string): ExternalManagedProcess | null {
    return this.processes.find((candidate) => matchesProcessName(candidate, name)) ?? null;
  }

  private runtimeFor(runtimeId: string): ExternalRuntime {
    const runtime = this.runtimes.find((candidate) => candidate.id === runtimeId);
    if (!runtime) throw new Error(`Unknown External Runtime: ${runtimeId}`);
    return runtime;
  }

  private notify(): void {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }
}

const processKey = (process: ExternalManagedProcess): string =>
  `${process.runtimeId}:${process.name}`;

const matchesProcessName = (process: ExternalManagedProcess, name: string): boolean =>
  process.name === name || processKey(process) === name;
