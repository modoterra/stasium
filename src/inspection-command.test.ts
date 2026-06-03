import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDiscoverCommand, runDoctorCommand, runValidateCommand } from "./inspection-command";
import { normalizeProcessDefinition } from "./process-definition";
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

describe("Inspection Commands", () => {
  test("validates a Manifest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-validate-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runValidateCommand([], io.context, { manifestPath });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["Manifest is valid: 1 Process Definition."]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports invalid Manifests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-validate-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\n');
      const io = context();

      const result = await runValidateCommand([], io.context, { manifestPath });

      expect(result).toEqual({ exitCode: 1 });
      expect(io.stderr[0]).toContain("service[0].command");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("checks Project readiness", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-doctor-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(manifestPath, '[[service]]\nname = "web"\ncommand = "bun dev"\n');
      const io = context();

      const result = await runDoctorCommand([], io.context, { manifestPath });

      expect(result).toEqual({ exitCode: 0 });
      expect(io.stdout).toEqual(["Project looks ready."]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("reports Project readiness problems", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-doctor-"));
    try {
      const manifestPath = join(dir, "stasium.toml");
      await writeFile(
        manifestPath,
        '[[service]]\nname = "web"\ncommand = "bun dev"\nworking_dir = "missing"\n',
      );
      const io = context();

      const result = await runDoctorCommand([], io.context, { manifestPath });

      expect(result).toEqual({ exitCode: 1 });
      expect(io.stderr[0]).toBe("Project readiness problems:");
      expect(io.stderr[1]).toContain("working directory not found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("prints discovered Candidates without writing a Manifest", async () => {
    const io = context();

    const result = await runDiscoverCommand([], io.context, {
      cwd: "/project",
      detect: async (cwd) => ({
        candidates: [
          {
            strategyId: "web",
            label: "web",
            priority: 0,
            defaultSelected: true,
            service: normalizeProcessDefinition({
              name: "web",
              launchInstruction: ["bun", "dev"],
            }),
            dependsOnIds: [],
          },
        ],
        warnings: [`checked ${cwd}`],
      }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(io.stdout).toEqual([
      "Discovered Candidates:",
      "- web: bun dev",
      "Warnings:",
      "- checked /project",
    ]);
  });
});
