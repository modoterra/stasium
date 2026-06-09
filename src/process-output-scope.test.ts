import { describe, expect, test } from "bun:test";
import { aggregateProcessOutput, formatProcessOutputTitle } from "./process-output-scope";

describe("aggregateProcessOutput", () => {
  test("sorts by timestamp and uses source order as a tie-breaker", () => {
    expect(
      aggregateProcessOutput([
        {
          name: "api",
          entries: [
            { timestamp: "2026-06-09T00:00:02.000Z", stream: "stdout", line: "second" },
            { timestamp: "2026-06-09T00:00:01.000Z", stream: "stdout", line: "api first" },
          ],
        },
        {
          name: "worker",
          entries: [
            { timestamp: "2026-06-09T00:00:01.000Z", stream: "stderr", line: "worker first" },
          ],
        },
      ]).map((entry) => entry.line),
    ).toEqual(["[api] api first", "[worker] worker first", "[api] second"]);
  });

  test("preserves per-source order for identical timestamps", () => {
    expect(
      aggregateProcessOutput([
        {
          name: "api",
          entries: [
            { timestamp: "2026-06-09T00:00:01.000Z", stream: "stdout", line: "one" },
            { timestamp: "2026-06-09T00:00:01.000Z", stream: "stdout", line: "two" },
          ],
        },
      ]).map((entry) => entry.line),
    ).toEqual(["[api] one", "[api] two"]);
  });
});

describe("formatProcessOutputTitle", () => {
  test("formats aggregate and scoped titles", () => {
    expect(formatProcessOutputTitle(null)).toBe("Logs");
    expect(formatProcessOutputTitle("api")).toBe("Logs (api)");
  });
});
