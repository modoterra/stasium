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

  test("passes legacy root commands to the root handler", async () => {
    const calls: string[][] = [];

    const result = await runCommand({
      argv: ["init"],
      legacyRootCommands: ["init"],
      root: async (args) => {
        calls.push(args);
        return { exitCode: 0 };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(calls).toEqual([["init"]]);
  });

  test("returns a command failure for unknown commands", async () => {
    const stderr: string[] = [];

    const result = await runCommand({
      argv: ["wat"],
      stderr: (message) => stderr.push(message),
      root: noopContextHandler,
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(stderr).toEqual(["Unknown command: wat"]);
  });
});
