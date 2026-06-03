import { describe, expect, test } from "bun:test";
import { runInitYesCommand } from "./init-command";
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

describe("Init Command", () => {
  test("creates a Manifest from default Candidates", async () => {
    const io = context();
    const web = normalizeProcessDefinition({ name: "web", launchInstruction: ["bun", "dev"] });
    let createdSelectionCount = 0;

    const result = await runInitYesCommand(io.context, {
      cwd: "/project",
      manifestPath: "/project/stasium.toml",
      hasManifest: async () => false,
      detect: async () => ({
        candidates: [
          {
            strategyId: "web",
            label: "web",
            priority: 0,
            defaultSelected: true,
            service: web,
            dependsOnIds: [],
          },
        ],
        warnings: ["discovery warning"],
      }),
      createManifest: async (_path, selection) => {
        createdSelectionCount = selection.getSelectedCount();
        return { services: [web], warnings: ["selection warning"] };
      },
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(createdSelectionCount).toBe(1);
    expect(io.stdout).toEqual([
      "Created /project/stasium.toml",
      "Detected services:",
      "- web: bun dev",
      "Warnings:",
      "- discovery warning",
      "- selection warning",
    ]);
  });

  test("creates an empty Manifest when no Candidates are selected", async () => {
    const io = context();

    const result = await runInitYesCommand(io.context, {
      manifestPath: "/project/stasium.toml",
      hasManifest: async () => false,
      detect: async () => ({ candidates: [], warnings: [] }),
      createManifest: async () => ({ services: [], warnings: [] }),
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(io.stdout).toEqual([
      "Created /project/stasium.toml",
      "No services selected. Edit stasium.toml to add services.",
    ]);
  });

  test("does not overwrite an existing Manifest", async () => {
    const io = context();
    let detected = false;

    const result = await runInitYesCommand(io.context, {
      manifestPath: "/project/stasium.toml",
      hasManifest: async () => true,
      detect: async () => {
        detected = true;
        return { candidates: [], warnings: [] };
      },
    });

    expect(result).toEqual({ exitCode: 1 });
    expect(detected).toBe(false);
    expect(io.stderr).toEqual(["Manifest already exists: /project/stasium.toml"]);
  });
});
