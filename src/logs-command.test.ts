import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLogsCommand } from "./logs-command";
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

describe("Logs Command", () => {
  test("prints durable Process Output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-logs-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runLogsCommand(["web"], io.context, {
        manifestPath,
        outputStore: {
          read: async () => "2026-01-01T00:00:00.000Z [OUT] ready\n",
          follow: async function* () {},
        },
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["2026-01-01T00:00:00.000Z [OUT] ready"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports unavailable Process Output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-logs-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runLogsCommand(["web"], io.context, {
        manifestPath,
        outputStore: {
          read: async () => null,
          follow: async function* () {},
        },
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["No Process Output available for web."]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("fails for unknown Managed Process names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-logs-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runLogsCommand(["worker"], io.context, {
        manifestPath,
        outputStore: {
          read: async () => null,
          follow: async function* () {},
        },
      });

      expect(result).toEqual({ exitCode: 1 });
      expect(io.stderr).toEqual(["Unknown Managed Process: worker"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("follows Process Output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-logs-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runLogsCommand(["web", "--follow"], io.context, {
        manifestPath,
        outputStore: {
          read: async () => null,
          follow: async function* () {
            yield "line one\n";
            yield "line two\n";
          },
        },
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["line one", "line two"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
