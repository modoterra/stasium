import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { ProcessDefinitionError, normalizeProcessDefinition } from "./process-definition";

describe("process definition normalization", () => {
  test("returns a domain-shaped Process Definition", () => {
    const definition = normalizeProcessDefinition(
      {
        name: " api ",
        launchInstruction: "bun run dev",
        workingDir: "app",
        environment: { PORT: "3000" },
        restartRule: "on-failure",
        startupDependencies: [" db "],
      },
      { baseDir: "/workspace" },
    );

    expect(definition).toMatchObject({
      name: "api",
      workingDir: resolve("/workspace", "app"),
      environment: { PORT: "3000" },
      launchInstruction: { executable: "bun", arguments: ["run", "dev"] },
      startupDependencies: ["db"],
      restartRule: "on-failure",
    });
  });

  test("preserves default Process Definition behavior", () => {
    const definition = normalizeProcessDefinition({
      name: "api",
      launchInstruction: ["bun", "--version"],
    });

    expect(definition).toMatchObject({
      workingDir: resolve(process.cwd(), "."),
      environment: {},
      launchInstruction: { executable: "bun", arguments: ["--version"] },
      startupDependencies: [],
      restartRule: "never",
    });
  });

  test("rejects invalid Startup Dependencies", () => {
    expect(() =>
      normalizeProcessDefinition({
        name: "api",
        launchInstruction: ["bun", "--version"],
        startupDependencies: [""],
      }),
    ).toThrow(ProcessDefinitionError);
  });

  test("rejects invalid Launch Instructions before runtime callers see them", () => {
    expect(() =>
      normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run api && bun run worker",
      }),
    ).toThrow(ProcessDefinitionError);
  });
});
