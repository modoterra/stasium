import { describe, expect, test } from "bun:test";
import {
  ProcessTreeMetricsSampler,
  formatBytes,
  formatCountdown,
  formatCpuPercent,
  formatDuration,
  parseProcStat,
  type ProcessMetricsReader,
  type ProcessStat,
} from "./process-metrics";

const reader = (stats: ProcessStat[][], times: number[]): ProcessMetricsReader => {
  let sampleIndex = 0;
  return {
    now: () => times[Math.min(sampleIndex, times.length - 1)] ?? 0,
    clockTicksPerSecond: 100,
    pageSizeBytes: 1024,
    cpuCount: 1,
    listProcessIds: async () =>
      stats[Math.min(sampleIndex, stats.length - 1)]?.map((s) => s.pid) ?? [],
    readProcessStat: async (pid) => {
      const sample = stats[Math.min(sampleIndex, stats.length - 1)] ?? [];
      const stat = sample.find((entry) => entry.pid === pid) ?? null;
      if (pid === sample.at(-1)?.pid) sampleIndex += 1;
      return stat;
    },
  };
};

describe("ProcessTreeMetricsSampler", () => {
  test("samples process tree RSS and interval CPU", async () => {
    const sampler = new ProcessTreeMetricsSampler(
      reader(
        [
          [
            { pid: 10, parentPid: 1, totalCpuTicks: 100, rssPages: 10 },
            { pid: 11, parentPid: 10, totalCpuTicks: 50, rssPages: 5 },
            { pid: 20, parentPid: 1, totalCpuTicks: 1000, rssPages: 100 },
          ],
          [
            { pid: 10, parentPid: 1, totalCpuTicks: 130, rssPages: 11 },
            { pid: 11, parentPid: 10, totalCpuTicks: 70, rssPages: 6 },
            { pid: 20, parentPid: 1, totalCpuTicks: 2000, rssPages: 100 },
          ],
        ],
        [0, 1000, 2000],
      ),
    );

    expect(await sampler.sample(10)).toMatchObject({ cpuPercent: null, rssBytes: 15 * 1024 });
    expect(await sampler.sample(10)).toMatchObject({ cpuPercent: 50, rssBytes: 17 * 1024 });
  });

  test("resets baseline when pid changes", async () => {
    const sampler = new ProcessTreeMetricsSampler(
      reader(
        [
          [{ pid: 10, parentPid: 1, totalCpuTicks: 100, rssPages: 10 }],
          [{ pid: 20, parentPid: 1, totalCpuTicks: 500, rssPages: 20 }],
        ],
        [0, 1000],
      ),
    );

    await sampler.sample(10);

    expect(await sampler.sample(20)).toMatchObject({ pid: 20, cpuPercent: null });
  });

  test("calculates CPU deltas per surviving process when children exit", async () => {
    const sampler = new ProcessTreeMetricsSampler(
      reader(
        [
          [
            { pid: 10, parentPid: 1, totalCpuTicks: 100, rssPages: 10 },
            { pid: 11, parentPid: 10, totalCpuTicks: 500, rssPages: 5 },
          ],
          [{ pid: 10, parentPid: 1, totalCpuTicks: 130, rssPages: 11 }],
        ],
        [0, 1000, 2000],
      ),
    );

    await sampler.sample(10);

    expect(await sampler.sample(10)).toMatchObject({ cpuPercent: 30 });
  });
});

describe("process metric formatting", () => {
  test("parses proc stat fields", () => {
    expect(
      parseProcStat("123 (node server) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22"),
    ).toMatchObject({ pid: 123, parentPid: 1, totalCpuTicks: 23, rssPages: 21 });
  });

  test("formats compact values", () => {
    expect(formatCpuPercent(null)).toBe("—");
    expect(formatCpuPercent(12.345)).toBe("12.3%");
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration("2026-06-09T00:00:00.000Z", Date.parse("2026-06-09T00:01:12.000Z"))).toBe(
      "1m 12s",
    );
    expect(formatCountdown(850)).toBe("850ms");
    expect(formatCountdown(2400)).toBe("2.4s");
    expect(formatCountdown(72_000)).toBe("1m 12s");
  });
});
