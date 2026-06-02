import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUpdateCommand } from "./update-command";
import type { CommandContext } from "./cli";
import type { UpdateDecision } from "./update-channel";

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

const updateAvailable = (
  channel = "stable",
): Extract<UpdateDecision, { type: "update-available" }> => ({
  type: "update-available",
  currentVersion: "0.1.0",
  latestVersion: "0.2.0",
  channel,
  artifact: {
    platform: { os: "linux", arch: "x64" },
    name: "stasium-linux-x64",
    url: "https://example.com/stasium-linux-x64",
    sha256: "abc123",
  },
});

describe("Update Command", () => {
  test("reports up-to-date releases", async () => {
    const io = context();
    const result = await runUpdateCommand([], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async (channel) => ({ type: "up-to-date", currentVersion: "0.1.0", channel }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(io.stdout).toEqual(["Stasium 0.1.0 is up to date on stable."]);
    expect(io.stderr).toEqual([]);
  });

  test("installs available updates", async () => {
    const io = context();
    let installed = false;
    const result = await runUpdateCommand([], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async () => updateAvailable(),
      installUpdate: async () => {
        installed = true;
        return { type: "installed", path: "/tmp/stasium" };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(installed).toBe(true);
    expect(io.stdout).toEqual(["Updated Stasium to 0.2.0. Restart Stasium to use it."]);
  });

  test("checks without installing", async () => {
    const io = context();
    let installed = false;
    const result = await runUpdateCommand(["--check"], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async () => updateAvailable(),
      installUpdate: async () => {
        installed = true;
        return { type: "installed", path: "/tmp/stasium" };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(installed).toBe(false);
    expect(io.stdout).toEqual(["Stasium 0.2.0 is available on stable."]);
  });

  test("overrides the update channel for one run", async () => {
    const io = context();
    const channels: string[] = [];

    const result = await runUpdateCommand(["--channel", "nightly", "--check"], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async (channel) => {
        channels.push(channel);
        return updateAvailable(channel);
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(channels).toEqual(["nightly"]);
    expect(io.stdout).toEqual(["Stasium 0.2.0 is available on nightly."]);
  });

  test("uses the configured update channel by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-update-command-"));
    try {
      const preferencesPath = join(dir, "update.json");
      await writeFile(preferencesPath, JSON.stringify({ channel: "beta" }));
      const io = context();
      const channels: string[] = [];

      const result = await runUpdateCommand(["--check"], io.context, {
        currentVersion: "0.1.0",
        executablePath: "/tmp/stasium",
        preferencesPath,
        checkUpdate: async (channel) => {
          channels.push(channel);
          return updateAvailable(channel);
        },
      });

      expect(result).toEqual({ exitCode: 0 });
      expect(channels).toEqual(["beta"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports unsupported platforms as command failures", async () => {
    const io = context();
    const result = await runUpdateCommand([], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async () => ({
        type: "unsupported-platform",
        currentVersion: "0.1.0",
        latestVersion: "0.2.0",
        channel: "stable",
        platform: { os: "linux", arch: "arm64" },
      }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual([
      "Stasium 0.2.0 is available, but no linux-arm64 artifact was found.",
    ]);
  });

  test("reports channel failures as command failures", async () => {
    const io = context();
    const result = await runUpdateCommand([], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async () => ({
        type: "failure",
        currentVersion: "0.1.0",
        channel: "stable",
        reason: "network unavailable",
      }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual(["network unavailable"]);
  });

  test("reports automatic update failures", async () => {
    const io = context();
    const result = await runUpdateCommand([], io.context, {
      currentVersion: "0.1.0",
      executablePath: "/tmp/stasium",
      checkUpdate: async () => updateAvailable(),
      installUpdate: async () => ({ type: "failed", reason: "checksum mismatch" }),
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(io.stderr).toEqual(["Stasium update failed: checksum mismatch"]);
  });
});
