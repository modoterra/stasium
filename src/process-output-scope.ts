import type { LogEntry } from "./types";

export interface ProcessOutputSource {
  name: string;
  entries: LogEntry[];
}

export const aggregateProcessOutput = (sources: ProcessOutputSource[]): LogEntry[] =>
  sources
    .flatMap((source, sourceIndex) =>
      source.entries.map((entry, entryIndex) => ({
        entry: {
          ...entry,
          line: `[${source.name}] ${entry.line}`,
        },
        sourceIndex,
        entryIndex,
      })),
    )
    .sort((left, right) => {
      const timestampOrder = left.entry.timestamp.localeCompare(right.entry.timestamp);
      if (timestampOrder !== 0) return timestampOrder;
      if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex;
      return left.entryIndex - right.entryIndex;
    })
    .map((item) => item.entry);

export const formatProcessOutputTitle = (name: string | null): string =>
  name ? `Logs (${name})` : "Logs";
