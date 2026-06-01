import { describe, expect, test } from "bun:test";
import { LaunchInstructionExecutionAdapter } from "./launch-execution";
import { normalizeProcessDefinition } from "./process-definition";
import { ServiceManager } from "./service-manager";

describe("ServiceManager launch execution", () => {
  test("shares one Launch Instruction execution Adapter across managed processes", async () => {
    let pathReads = 0;
    const spawned: string[][] = [];
    const launchAdapter = new LaunchInstructionExecutionAdapter({
      pathReader: async () => {
        pathReads += 1;
        return process.env.PATH ?? "";
      },
      processInfoReader: async (pid) => ({ pid, startedAt: "started", command: null }),
      spawner: (options) => {
        spawned.push(options.cmd);
        return {
          pid: spawned.length,
          stdout: null,
          stderr: null,
          exited: new Promise(() => {}),
          signalCode: null,
          kill: () => {},
        };
      },
    });

    const manager = new ServiceManager(
      [
        normalizeProcessDefinition({
          name: "api",
          command: ["bun", "run", "dev"],
        }),
        normalizeProcessDefinition({
          name: "worker",
          command: ["bun", "run", "worker"],
        }),
      ],
      { launchAdapter },
    );

    await manager.startAll();

    expect(pathReads).toBe(1);
    expect(spawned).toEqual([
      ["bun", "run", "dev"],
      ["bun", "run", "worker"],
    ]);
  });
});
