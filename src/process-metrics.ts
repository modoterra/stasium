import { readFile, readdir } from "node:fs/promises";
import { cpus } from "node:os";
import { join } from "node:path";

export interface ProcessMetricsSample {
  pid: number;
  cpuPercent: number | null;
  rssBytes: number | null;
  sampledAt: number;
}

export interface ProcessMetricsReader {
  now: () => number;
  clockTicksPerSecond: number;
  pageSizeBytes: number;
  cpuCount: number;
  listProcessIds: () => Promise<number[]>;
  readProcessStat: (pid: number) => Promise<ProcessStat | null>;
}

export interface ProcessStat {
  pid: number;
  parentPid: number;
  totalCpuTicks: number;
  rssPages: number;
}

interface ProcessMetricsSnapshot {
  totalCpuTicks: number;
  rssBytes: number;
  sampledAt: number;
}

const DEFAULT_CLOCK_TICKS_PER_SECOND = 100;
const DEFAULT_PAGE_SIZE_BYTES = 4096;

export class ProcessTreeMetricsSampler {
  private previous: ProcessMetricsSnapshot | null = null;
  private previousPid: number | null = null;

  constructor(private readonly reader: ProcessMetricsReader = createProcfsMetricsReader()) {}

  reset(): void {
    this.previous = null;
    this.previousPid = null;
  }

  async sample(pid: number | null): Promise<ProcessMetricsSample | null> {
    if (pid === null) {
      this.reset();
      return null;
    }

    const snapshot = await this.snapshot(pid);
    if (!snapshot) {
      this.reset();
      return {
        pid,
        cpuPercent: null,
        rssBytes: null,
        sampledAt: this.reader.now(),
      };
    }

    const previous = this.previousPid === pid ? this.previous : null;
    this.previous = snapshot;
    this.previousPid = pid;

    if (!previous) {
      return { pid, cpuPercent: null, rssBytes: snapshot.rssBytes, sampledAt: snapshot.sampledAt };
    }

    const elapsedMs = snapshot.sampledAt - previous.sampledAt;
    if (elapsedMs <= 0) {
      return { pid, cpuPercent: null, rssBytes: snapshot.rssBytes, sampledAt: snapshot.sampledAt };
    }

    const cpuTicks = Math.max(0, snapshot.totalCpuTicks - previous.totalCpuTicks);
    const cpuSeconds = cpuTicks / this.reader.clockTicksPerSecond;
    const elapsedSeconds = elapsedMs / 1000;
    const cpuPercent = (cpuSeconds / elapsedSeconds) * 100;

    return { pid, cpuPercent, rssBytes: snapshot.rssBytes, sampledAt: snapshot.sampledAt };
  }

  private async snapshot(rootPid: number): Promise<ProcessMetricsSnapshot | null> {
    const stats = await this.readProcessTree(rootPid);
    if (stats.length === 0) return null;

    return {
      totalCpuTicks: stats.reduce((sum, stat) => sum + stat.totalCpuTicks, 0),
      rssBytes: stats.reduce((sum, stat) => sum + stat.rssPages * this.reader.pageSizeBytes, 0),
      sampledAt: this.reader.now(),
    };
  }

  private async readProcessTree(rootPid: number): Promise<ProcessStat[]> {
    const processIds = await this.reader.listProcessIds();
    const stats = (
      await Promise.all(processIds.map((pid) => this.reader.readProcessStat(pid)))
    ).filter((stat): stat is ProcessStat => stat !== null);
    const childrenByParent = new Map<number, ProcessStat[]>();
    for (const stat of stats) {
      const children = childrenByParent.get(stat.parentPid) ?? [];
      children.push(stat);
      childrenByParent.set(stat.parentPid, children);
    }

    const root = stats.find((stat) => stat.pid === rootPid);
    if (!root) return [];

    const tree: ProcessStat[] = [];
    const queue = [root];
    while (queue.length > 0) {
      const stat = queue.shift();
      if (!stat) continue;
      tree.push(stat);
      queue.push(...(childrenByParent.get(stat.pid) ?? []));
    }
    return tree;
  }
}

export const createProcfsMetricsReader = (): ProcessMetricsReader => ({
  now: () => Date.now(),
  clockTicksPerSecond: DEFAULT_CLOCK_TICKS_PER_SECOND,
  pageSizeBytes: DEFAULT_PAGE_SIZE_BYTES,
  cpuCount: cpus().length,
  listProcessIds: async () => {
    if (process.platform !== "linux") return [];
    const entries = await readdir("/proc");
    return entries.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0);
  },
  readProcessStat: async (pid) => {
    if (process.platform !== "linux") return null;
    try {
      return parseProcStat(await readFile(join("/proc", String(pid), "stat"), "utf8"));
    } catch {
      return null;
    }
  },
});

export const parseProcStat = (value: string): ProcessStat | null => {
  const closeParen = value.lastIndexOf(")");
  const openParen = value.indexOf("(");
  if (openParen === -1 || closeParen === -1 || closeParen <= openParen) return null;

  const pid = Number(value.slice(0, openParen).trim());
  const rest = value
    .slice(closeParen + 2)
    .trim()
    .split(/\s+/);
  const parentPid = Number(rest[1]);
  const utime = Number(rest[11]);
  const stime = Number(rest[12]);
  const rssPages = Number(rest[21]);

  if (![pid, parentPid, utime, stime, rssPages].every(Number.isFinite)) return null;
  return { pid, parentPid, totalCpuTicks: utime + stime, rssPages };
};

export const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)}${units[unitIndex]}`;
};

export const formatCpuPercent = (value: number | null): string =>
  value === null ? "—" : `${value.toFixed(1)}%`;

export const formatDuration = (startedAt: string | null, now = Date.now()): string => {
  if (!startedAt) return "—";
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "—";
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
};

export const formatCountdown = (milliseconds: number | null): string => {
  if (milliseconds === null) return "—";
  if (milliseconds < 1000) return `${Math.ceil(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
};
