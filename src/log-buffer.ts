import type { LogEntry } from "./types";

const formatLogLine = (entry: LogEntry): string => {
  const streamLabel = entry.stream === "stderr" ? "ERR" : "OUT";
  return `${entry.timestamp} [${streamLabel}] ${entry.line}`;
};

export class LogBuffer {
  private readonly capacity: number;
  private entries: LogEntry[] = [];
  private version = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  add(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
    this.version += 1;
  }

  all(): LogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.version += 1;
  }

  getVersion(): number {
    return this.version;
  }

  getFullText(): string {
    return this.entries.map(formatLogLine).join("\n");
  }

  size(): number {
    return this.entries.length;
  }
}
