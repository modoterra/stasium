import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConfigCommand } from "./config-command";
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

describe("Config Command", () => {
  test("gets default update preferences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-config-"));
    try {
      const io = context();
      const result = await runConfigCommand(["get", "update.channel"], io.context, {
        preferencesPath: join(dir, "update.json"),
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["stable"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("sets and persists update channel", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-config-"));
    try {
      const path = join(dir, "update.json");
      const io = context();

      const result = await runConfigCommand(["set", "update.channel", "beta"], io.context, {
        preferencesPath: path,
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["Set update.channel to beta."]);
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ channel: "beta" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("gets and sets update enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-config-"));
    try {
      const path = join(dir, "update.json");
      const setIo = context();
      const getIo = context();

      expect(
        await runConfigCommand(["set", "update.enabled", "false"], setIo.context, {
          preferencesPath: path,
        }),
      ).toEqual({ exitCode: 0 });
      expect(
        await runConfigCommand(["get", "update.enabled"], getIo.context, {
          preferencesPath: path,
        }),
      ).toEqual({ exitCode: 0 });
      expect(getIo.stdout).toEqual(["false"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects invalid boolean values", async () => {
    const io = context();
    const result = await runConfigCommand(["set", "update.enabled", "maybe"], io.context);

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual(["update.enabled must be true or false."]);
  });

  test("rejects unsupported keys", async () => {
    const io = context();
    const result = await runConfigCommand(["get", "theme"], io.context);

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual([
      "Unsupported config key: theme. Supported keys: update.channel, update.enabled.",
    ]);
  });
});
