import { describe, expect, test } from "bun:test";
import { runStartCommand, runStatusCommand, type LifecycleOperations } from "./lifecycle-command";
import type { CommandContext } from "./cli";

const context = (): { context: CommandContext; stdout: string[]; stderr: string[] } => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    context: {
      stdout: (message) => stdout.push(message),
      stderr: (message) => stderr.push(message),
    },
  };
};

describe("Lifecycle Commands", () => {
  test("starts all Direct Managed Processes", async () => {
    const io = context();
    const calls: Array<string | undefined> = [];
    const operations: LifecycleOperations = {
      start: async (name) => {
        calls.push(name);
        return ["web", "worker"];
      },
      status: async () => [],
    };

    const result = await runStartCommand([], io.context, { operations });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual([undefined]);
    expect(io.stdout).toEqual(["Started web.", "Started worker."]);
  });

  test("starts one named Direct Managed Process", async () => {
    const io = context();
    const calls: Array<string | undefined> = [];
    const operations: LifecycleOperations = {
      start: async (name) => {
        calls.push(name);
        return ["web"];
      },
      status: async () => [],
    };

    const result = await runStartCommand(["web"], io.context, { operations });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual(["web"]);
    expect(io.stdout).toEqual(["Started web."]);
  });

  test("reports unknown Managed Process names", async () => {
    const io = context();
    const operations: LifecycleOperations = {
      start: async () => {
        throw new Error("Unknown Managed Process: missing");
      },
      status: async () => [],
    };

    const result = await runStartCommand(["missing"], io.context, { operations });

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual(["Unknown Managed Process: missing"]);
  });

  test("prints Managed Process status", async () => {
    const io = context();
    const operations: LifecycleOperations = {
      start: async () => [],
      status: async () => [
        { name: "web", state: "RUNNING" },
        { name: "worker", state: "STOPPED" },
      ],
    };

    const result = await runStatusCommand([], io.context, { operations });

    expect(result).toEqual({ exitCode: 0 });
    expect(io.stdout).toEqual(["web: RUNNING", "worker: STOPPED"]);
  });
});
