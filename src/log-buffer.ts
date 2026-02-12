import type { LogEntry } from "./types";

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
}
