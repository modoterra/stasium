import { resolve } from "node:path";
import { LogBuffer } from "./log-buffer";
import { fileExists } from "./shared";
import type { DockerService, DockerServiceState } from "./types";

const COMPOSE_FILES = ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"];

const splitLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const getComposeEnvPath = (cwd: string): string | null => {
  const envValue = process.env.COMPOSE_FILE;
  if (!envValue) return null;
  const delimiter = process.platform === "win32" ? ";" : ":";
  const firstPath = envValue.split(delimiter).map((item) => item.trim())[0];
  if (!firstPath) return null;
  return resolve(cwd, firstPath);
};

const parsePsOutput = (output: string): DockerPsEntry[] => {
  const trimmed = output.trim();
  if (trimmed.length === 0) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is DockerPsEntry => {
        return entry !== null && typeof entry === "object";
      });
    } catch {
      return [];
    }
  }

  const entries: DockerPsEntry[] = [];
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as DockerPsEntry;
      entries.push(entry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
};

export const detectComposeFile = async (cwd: string): Promise<string | null> => {
  const envPath = getComposeEnvPath(cwd);
  if (envPath && (await fileExists(envPath))) {
    return envPath;
  }

  let current = cwd;
  while (true) {
    for (const name of COMPOSE_FILES) {
      const fullPath = resolve(current, name);
      if (await fileExists(fullPath)) {
        return fullPath;
      }
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  return null;
};

export type DockerUpdateCallback = () => void;

const LOG_CAPACITY = 2000;

const parseDockerState = (state: string): DockerServiceState => {
  const lower = state.toLowerCase();
  if (lower === "running") return "running";
  if (lower === "exited") return "exited";
  if (lower === "paused") return "paused";
  if (lower === "restarting") return "restarting";
  if (lower === "dead") return "dead";
  if (lower === "created") return "created";
  if (lower.includes("removing")) return "removing";
  return "unknown";
};

export const getStableDockerServiceNames = (
  configServices: string[],
  discoveredServices: string[],
): string[] => {
  const names = configServices.length > 0 ? [...configServices] : [...discoveredServices];

  if (configServices.length > 0) {
    for (const name of discoveredServices) {
      if (!names.includes(name)) names.push(name);
    }
  }

  return names.sort((left, right) => left.localeCompare(right));
};

const pickAggregateState = (entries: DockerPsEntry[]): DockerServiceState => {
  const states = entries.map((entry) => parseDockerState(entry.State ?? "unknown"));
  const priority: DockerServiceState[] = [
    "running",
    "restarting",
    "paused",
    "removing",
    "exited",
    "dead",
    "created",
    "unknown",
  ];
  for (const state of priority) {
    if (states.includes(state)) return state;
  }
  return "unknown";
};

interface DockerPsEntry {
  Name?: string;
  Service?: string;
  State?: string;
  Status?: string;
  Ports?: string;
}

export class DockerManager {
  private readonly composePath: string;
  private readonly cwd: string;
  private services: DockerService[] = [];
  private selectedIndex = 0;
  private readonly logs: Map<string, LogBuffer> = new Map();
  private readonly updateCallbacks: Set<DockerUpdateCallback> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing = false;
  private activeLogProcess: { proc: Bun.Subprocess; name: string } | null = null;
  private activeLogService: string | null = null;

  constructor(composePath: string) {
    this.composePath = composePath;
    this.cwd = resolve(composePath, "..");
  }

  private async runCompose(args: string[]): Promise<number> {
    const proc = Bun.spawn({
      cmd: ["docker", "compose", "-f", this.composePath, ...args],
      cwd: this.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    return await proc.exited;
  }

  onUpdate(callback: DockerUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  getServices(): DockerService[] {
    return [...this.services];
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    const max = Math.max(0, this.services.length - 1);
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
    const selectedName = this.getSelectedService()?.name ?? null;
    if (selectedName && selectedName !== this.activeLogService) {
      this.streamSelectedLogs();
    }
  }

  getSelectedService(): DockerService | null {
    return this.services[this.selectedIndex] ?? null;
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
    const svc = this.getSelectedService();
    if (!svc) return null;
    return this.getLogBuffer(svc.name);
  }

  getActiveLogBuffer(): LogBuffer | null {
    if (!this.activeLogService) return null;
    return this.getLogBuffer(this.activeLogService);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;

    try {
      let configServices: string[] = [];
      try {
        const configProc = Bun.spawn({
          cmd: ["docker", "compose", "-f", this.composePath, "config", "--services"],
          cwd: this.cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        const configOutput = await new Response(configProc.stdout).text();
        const exitCode = await configProc.exited;
        if (exitCode === 0) {
          configServices = splitLines(configOutput);
        }
      } catch {
        // ignore config errors
      }

      const proc = Bun.spawn({
        cmd: ["docker", "compose", "-f", this.composePath, "ps", "--format", "json", "-a"],
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      const entries = parsePsOutput(output);
      const entriesByService = new Map<string, DockerPsEntry[]>();
      const entryOrder: string[] = [];

      for (const entry of entries) {
        const name = entry.Service ?? entry.Name ?? "unknown";
        const list = entriesByService.get(name);
        if (list) {
          list.push(entry);
        } else {
          entriesByService.set(name, [entry]);
          entryOrder.push(name);
        }
      }

      const serviceNames = getStableDockerServiceNames(configServices, entryOrder);

      const previousName = this.getSelectedService()?.name ?? null;

      this.services = serviceNames.map((name) => {
        const list = entriesByService.get(name) ?? [];
        if (list.length === 0) {
          return {
            name,
            state: "created",
            status: "",
            ports: "",
          };
        }

        const state = pickAggregateState(list);
        const representative =
          list.find((entry) => parseDockerState(entry.State ?? "unknown") === state) ?? list[0];

        return {
          name,
          state,
          status: representative?.Status ?? "",
          ports: representative?.Ports ?? "",
        };
      });

      if (previousName !== null) {
        const restoredIndex = this.services.findIndex((s) => s.name === previousName);
        this.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
      }

      const maxIndex = Math.max(0, this.services.length - 1);
      if (this.selectedIndex > maxIndex) {
        this.selectedIndex = maxIndex;
      }

      const selected = this.getSelectedService();
      if (selected && this.activeLogService !== selected.name) {
        this.streamSelectedLogs();
      }

      this.notify();
    } catch {
      // docker compose not available or failed
    } finally {
      this.refreshing = false;
    }
  }

  async start(name: string): Promise<void> {
    await this.runCompose(["up", "-d", name]);
    await this.refresh();
  }

  async stop(name: string): Promise<void> {
    await this.runCompose(["stop", name]);
    await this.refresh();
  }

  async restart(name: string): Promise<void> {
    const exitCode = await this.runCompose(["restart", name]);
    if (exitCode !== 0) {
      await this.runCompose(["up", "-d", name]);
    }
    await this.refresh();
  }

  async startSelected(): Promise<void> {
    const svc = this.getSelectedService();
    if (!svc) return;
    await this.start(svc.name);
    this.streamSelectedLogs();
  }

  async stopSelected(): Promise<void> {
    const svc = this.getSelectedService();
    if (!svc) return;
    await this.stop(svc.name);
    this.streamSelectedLogs();
  }

  async restartSelected(): Promise<void> {
    const svc = this.getSelectedService();
    if (!svc) return;
    await this.restart(svc.name);
    this.streamSelectedLogs();
  }

  streamLogs(name: string): void {
    this.stopLogStream();
    const buffer = this.getLogBuffer(name);
    buffer.clear();
    this.notify();

    try {
      const proc = Bun.spawn({
        cmd: ["docker", "compose", "-f", this.composePath, "logs", "-f", "--tail=200", name],
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      this.activeLogProcess = { proc: proc as Bun.Subprocess, name };
      this.activeLogService = name;
      this.readStream(proc.stdout, buffer, "stdout");
      this.readStream(proc.stderr, buffer, "stderr");
    } catch {
      // failed to spawn
    }
  }

  streamSelectedLogs(): void {
    const svc = this.getSelectedService();
    if (!svc) return;
    this.streamLogs(svc.name);
  }

  stopLogStream(): void {
    if (this.activeLogProcess) {
      try {
        this.activeLogProcess.proc.kill("SIGTERM");
      } catch {
        // already dead
      }
      this.activeLogProcess = null;
      this.activeLogService = null;
    }
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
  }

  private readStream(
    stream: ReadableStream<Uint8Array> | null,
    buffer: LogBuffer,
    source: "stdout" | "stderr",
  ): void {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let remainder = "";

    const readLoop = async () => {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = decoder.decode(result.value);
        remainder += chunk;
        const parts = remainder.split(/\r?\n/);
        remainder = parts.pop() ?? "";
        for (const line of parts) {
          buffer.add({
            timestamp: new Date().toISOString(),
            line,
            stream: source,
          });
        }
        this.notify();
      }
      if (remainder) {
        buffer.add({
          timestamp: new Date().toISOString(),
          line: remainder,
          stream: source,
        });
        remainder = "";
        this.notify();
      }
    };

    readLoop().catch(() => {});
  }

  private notify(): void {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }
}
