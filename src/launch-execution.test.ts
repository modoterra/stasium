import { describe, expect, test } from "bun:test";
import { LaunchInstructionExecutionAdapter, type LaunchExecutionEvent } from "./launch-execution";

const streamFrom = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("LaunchInstructionExecutionAdapter", () => {
  test("spawns with normalized argv, working directory, environment, and instance PATH cache", async () => {
    const spawned: Array<{ cmd: string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
    let pathReads = 0;
    const adapter = new LaunchInstructionExecutionAdapter({
      pathReader: async () => {
        pathReads += 1;
        return "/fresh/bin";
      },
      processInfoReader: async () => ({ pid: 101, startedAt: "started", command: "bun" }),
      spawner: (options) => {
        spawned.push({ cmd: options.cmd, cwd: options.cwd, env: options.env });
        return {
          pid: 101,
          stdout: null,
          stderr: null,
          exited: new Promise(() => {}),
          signalCode: null,
          kill: () => {},
        };
      },
    });

    await adapter.start(
      { argv: ["bun", "run", "dev"], workingDir: "/project", env: { PORT: "3000" } },
      () => {},
    );
    await adapter.start(
      { argv: ["bun", "run", "worker"], workingDir: "/project", env: {} },
      () => {},
    );

    expect(pathReads).toBe(1);
    expect(spawned[0]).toMatchObject({
      cmd: ["bun", "run", "dev"],
      cwd: "/project",
      env: { PATH: "/fresh/bin", PORT: "3000" },
    });
    expect(spawned[1]?.env.PATH).toBe("/fresh/bin");
  });

  test("emits structured spawn failure and Process Output", async () => {
    const events: LaunchExecutionEvent[] = [];
    const adapter = new LaunchInstructionExecutionAdapter({
      now: () => "now",
      pathReader: async () => "/fresh/bin",
      spawner: () => {
        throw new Error("spawn failed");
      },
    });

    const handle = await adapter.start(
      { argv: ["missing"], workingDir: "/project", env: {} },
      (event) => {
        events.push(event);
      },
    );

    expect(handle).toBeNull();
    expect(events).toEqual([
      { type: "spawn-failed", message: "spawn failed" },
      {
        type: "output",
        entry: { timestamp: "now", line: "spawn failed", stream: "stderr" },
      },
    ]);
  });

  test("emits output and exit events without launching OS processes", async () => {
    const events: LaunchExecutionEvent[] = [];
    const adapter = new LaunchInstructionExecutionAdapter({
      now: () => "now",
      pathReader: async () => "/fresh/bin",
      processInfoReader: async () => null,
      spawner: () => ({
        pid: 202,
        stdout: streamFrom(["hello\npartial"]),
        stderr: streamFrom(["warn\n"]),
        exited: Promise.resolve(7),
        signalCode: "SIGTERM",
        kill: () => {},
      }),
    });

    await adapter.start({ argv: ["bun"], workingDir: "/project", env: {} }, (event) => {
      events.push(event);
    });
    await flush();

    expect(events).toContainEqual({
      type: "started",
      pid: 202,
      startedAt: "now",
      identityVerified: false,
    });
    expect(events).toContainEqual({
      type: "output",
      entry: { timestamp: "now", line: "hello", stream: "stdout" },
    });
    expect(events).toContainEqual({
      type: "output",
      entry: { timestamp: "now", line: "partial", stream: "stdout" },
    });
    expect(events).toContainEqual({ type: "exit", code: 7, signal: "SIGTERM" });
  });

  test("signals process groups before falling back to direct process signals", async () => {
    const killed: NodeJS.Signals[] = [];
    const groups: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const adapter = new LaunchInstructionExecutionAdapter({
      pathReader: async () => "/fresh/bin",
      processInfoReader: async () => null,
      signalProcessGroup: (pid, signal) => {
        groups.push({ pid, signal });
        return true;
      },
      spawner: () => ({
        pid: 303,
        stdout: null,
        stderr: null,
        exited: new Promise(() => {}),
        signalCode: null,
        kill: (signal) => killed.push(signal),
      }),
    });

    const handle = await adapter.start(
      { argv: ["bun"], workingDir: "/project", env: {}, detached: true },
      () => {},
    );

    handle?.signal("SIGINT");
    expect(groups).toEqual([{ pid: 303, signal: "SIGINT" }]);
    expect(killed).toEqual([]);
  });
});
