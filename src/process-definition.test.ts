import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { ProcessDefinitionError, normalizeProcessDefinition } from "./process-definition";

describe("process definition normalization", () => {
  test("returns a domain-shaped Process Definition", () => {
    const definition = normalizeProcessDefinition(
      {
        name: " api ",
        command: "bun run dev",
        working_dir: "app",
        env: { PORT: "3000" },
        restart_policy: "on-failure",
        depends_on: [" db "],
      },
      { baseDir: "/workspace" },
    );

    expect(definition).toMatchObject({
      name: "api",
      working_dir: resolve("/workspace", "app"),
      env: { PORT: "3000" },
      launchInstruction: { executable: "bun", arguments: ["run", "dev"] },
      startupDependencies: ["db"],
      restartRule: "on-failure",
    });
  });

  test("preserves default Process Definition behavior", () => {
    const definition = normalizeProcessDefinition({ name: "api", command: ["bun", "--version"] });

    expect(definition).toMatchObject({
      env: {},
      launchInstruction: { executable: "bun", arguments: ["--version"] },
      startupDependencies: [],
      restartRule: "never",
    });
  });

  test("rejects invalid Startup Dependencies", () => {
    expect(() =>
      normalizeProcessDefinition({ name: "api", command: ["bun", "--version"], depends_on: [""] }),
    ).toThrow(ProcessDefinitionError);
  });
});
