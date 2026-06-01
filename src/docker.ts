import { resolve } from "node:path";
import type {
  ExternalRuntime,
  ExternalRuntimeAdapter,
  ExternalRuntimeOutputStream,
} from "./external-runtime";
import { fileExists } from "./shared";
import type { ExternalManagedProcess, ExternalManagedProcessState, LogEntry } from "./types";

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

const parseDockerState = (state: string): ExternalManagedProcessState => {
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

const pickAggregateState = (entries: DockerPsEntry[]): ExternalManagedProcessState => {
  const states = entries.map((entry) => parseDockerState(entry.State ?? "unknown"));
  const priority: ExternalManagedProcessState[] = [
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

export const createDockerComposeExternalRuntimeAdapter = (): ExternalRuntimeAdapter => ({
  id: "docker-compose",
  name: "Docker Compose",
  detect: async (cwd) => {
    const composePath = await detectComposeFile(cwd);
    return composePath ? new DockerComposeExternalRuntime(composePath) : null;
  },
});

class DockerComposeExternalRuntime implements ExternalRuntime {
  readonly id = "docker-compose";
  readonly name = "Docker Compose";
  private readonly composePath: string;
  private readonly cwd: string;

  constructor(composePath: string) {
    this.composePath = composePath;
    this.cwd = resolve(composePath, "..");
  }

  async snapshot(): Promise<ExternalManagedProcess[]> {
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

    return getStableDockerServiceNames(configServices, entryOrder).map((name) => {
      const list = entriesByService.get(name) ?? [];
      if (list.length === 0) {
        return {
          runtimeId: this.id,
          runtimeName: this.name,
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
        runtimeId: this.id,
        runtimeName: this.name,
        name,
        state,
        status: representative?.Status ?? "",
        ports: representative?.Ports ?? "",
      };
    });
  }

  async start(name: string): Promise<void> {
    await this.runCompose(["up", "-d", name]);
  }

  isAvailable(process: ExternalManagedProcess): boolean {
    return process.state === "running";
  }

  async stop(name: string): Promise<void> {
    await this.runCompose(["stop", name]);
  }

  async restart(name: string): Promise<void> {
    const exitCode = await this.runCompose(["restart", name]);
    if (exitCode !== 0) {
      await this.runCompose(["up", "-d", name]);
    }
  }

  streamOutput(
    name: string,
    onOutput: (entry: LogEntry) => void,
  ): ExternalRuntimeOutputStream | null {
    try {
      const proc = Bun.spawn({
        cmd: ["docker", "compose", "-f", this.composePath, "logs", "-f", "--tail=200", name],
        cwd: this.cwd,
        stdout: "pipe",
        stderr: "pipe",
      });

      this.readStream(proc.stdout, onOutput, "stdout");
      this.readStream(proc.stderr, onOutput, "stderr");
      return {
        stop: () => {
          try {
            proc.kill("SIGTERM");
          } catch {
            // already dead
          }
        },
      };
    } catch {
      return null;
    }
  }

  async destroy(): Promise<void> {}

  private async runCompose(args: string[]): Promise<number> {
    const proc = Bun.spawn({
      cmd: ["docker", "compose", "-f", this.composePath, ...args],
      cwd: this.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    return await proc.exited;
  }

  private readStream(
    stream: ReadableStream<Uint8Array> | null,
    onOutput: (entry: LogEntry) => void,
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
          onOutput({ timestamp: new Date().toISOString(), line, stream: source });
        }
      }
      if (remainder) {
        onOutput({ timestamp: new Date().toISOString(), line: remainder, stream: source });
      }
    };

    readLoop().catch(() => {});
  }
}
