import { describe, expect, test } from "bun:test";
import { runCommand, type CommandContext, type CommandResult } from "./cli";

const noopContextHandler = async (): Promise<CommandResult> => ({ exitCode: 0 });

describe("Command Runner", () => {
  test("delegates the root command when no argv is provided", async () => {
    const calls: string[][] = [];

    const result = await runCommand({
      argv: [],
      root: async (args) => {
        calls.push(args);
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual([[]]);
  });

  test("dispatches registered non-root commands with injected output", async () => {
    const stdout: string[] = [];
    const contexts: CommandContext[] = [];

    const result = await runCommand({
      argv: ["example", "--flag"],
      stdout: (message) => stdout.push(message),
      root: noopContextHandler,
      commands: {
        example: async (args, context) => {
          contexts.push(context);
          context.stdout(args.join(" "));
          return { exitCode: 7 };
        },
      },
    });

    expect(result).toEqual({ exitCode: 7 });
    expect(stdout).toEqual(["--flag"]);
    expect(contexts).toHaveLength(1);
  });

  test("dispatches registered commands instead of the root handler", async () => {
    const calls: string[][] = [];

    const result = await runCommand({
      argv: ["init"],
      root: async (args) => {
        calls.push(args);
        return { exitCode: 1 };
      },
      commands: {
        init: async (args) => {
          calls.push(["init", ...args]);
          return { exitCode: 0 };
        },
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual([["init"]]);
  });

  test("can temporarily pass legacy root commands to the root handler", async () => {
    const calls: string[][] = [];

    const result = await runCommand({
      argv: ["legacy"],
      legacyRootCommands: ["legacy"],
      root: async (args) => {
        calls.push(args);
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual([["legacy"]]);
  });

  test("returns a command failure for unknown commands", async () => {
    const stderr: string[] = [];

    const result = await runCommand({
      argv: ["wat"],
      stderr: (message) => stderr.push(message),
      root: noopContextHandler,
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stderr).toEqual(['Unknown command: wat. Run "stasium --help" for usage.']);
  });

  test("prints root help without running the root handler", async () => {
    const stdout: string[] = [];

    const result = await runCommand({
      argv: ["--help"],
      stdout: (message) => stdout.push(message),
      root: async () => ({ exitCode: 1 }),
      commands: {
        init: {
          usage: "stasium init",
          description: "Start Project Setup.",
          handler: noopContextHandler,
        },
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout[0]).toContain("Usage: stasium [command]");
    expect(stdout[0]).toContain("Run Stasium's interactive Workspace");
    expect(stdout[0]).toContain("init  Start Project Setup.");
  });

  test("prints command help", async () => {
    const stdout: string[] = [];

    const result = await runCommand({
      argv: ["help", "init"],
      stdout: (message) => stdout.push(message),
      root: noopContextHandler,
      commands: {
        init: {
          usage: "stasium init",
          description: "Start Project Setup.",
          handler: noopContextHandler,
        },
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout).toEqual(["stasium init\n\nStart Project Setup."]);
  });

  test("prints command help from command flags", async () => {
    const stdout: string[] = [];

    const result = await runCommand({
      argv: ["init", "--help"],
      stdout: (message) => stdout.push(message),
      root: noopContextHandler,
      commands: {
        init: {
          usage: "stasium init",
          description: "Start Project Setup.",
          handler: noopContextHandler,
        },
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout).toEqual(["stasium init\n\nStart Project Setup."]);
  });

  test("prints version output", async () => {
    const stdout: string[] = [];

    const result = await runCommand({
      argv: ["--version"],
      version: "1.2.3",
      stdout: (message) => stdout.push(message),
      root: noopContextHandler,
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(stdout).toEqual(["1.2.3"]);
  });
});
