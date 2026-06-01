import { describe, expect, test } from "bun:test";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import {
  StartupDependencyPlanError,
  getBlockedProcessStates,
  planStartupDependencies,
} from "./startup-dependency-plan";
import type { ServiceConfig } from "./types";

const processDefinition = (input: ProcessDefinitionInput): ServiceConfig =>
  normalizeProcessDefinition(input);

describe("Startup Dependency planning", () => {
  test("computes Startup order and reverse Shutdown order", () => {
    const plan = planStartupDependencies([
      processDefinition({ name: "api", command: ["bun", "run", "dev"], depends_on: ["db"] }),
      processDefinition({ name: "db", command: ["bun", "run", "db"] }),
      processDefinition({
        name: "worker",
        command: ["bun", "run", "worker"],
        depends_on: ["api"],
      }),
    ]);

    expect(plan.startupOrder).toEqual(["db", "api", "worker"]);
    expect(plan.shutdownOrder).toEqual(["worker", "api", "db"]);
    expect(plan.startupLayers).toEqual([["db"], ["api"], ["worker"]]);
  });

  test("validates duplicate names, unknown dependencies, self-dependencies, and cycles", () => {
    expect(() =>
      planStartupDependencies([
        processDefinition({ name: "api", command: ["bun", "run", "dev"] }),
        processDefinition({ name: "api", command: ["bun", "run", "worker"] }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({ name: "api", command: ["bun", "run", "dev"], depends_on: ["db"] }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({ name: "api", command: ["bun", "run", "dev"], depends_on: ["api"] }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({ name: "api", command: ["bun", "run", "dev"], depends_on: ["worker"] }),
        processDefinition({
          name: "worker",
          command: ["bun", "run", "worker"],
          depends_on: ["api"],
        }),
      ]),
    ).toThrow(StartupDependencyPlanError);
  });

  test("represents blocked Process State when Startup Dependencies fail", () => {
    const plan = planStartupDependencies([
      processDefinition({ name: "db", command: ["bun", "run", "db"] }),
      processDefinition({ name: "cache", command: ["bun", "run", "cache"] }),
      processDefinition({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["db", "cache"],
      }),
      processDefinition({
        name: "worker",
        command: ["bun", "run", "worker"],
        depends_on: ["api"],
      }),
    ]);

    expect(getBlockedProcessStates(plan, ["db"])).toEqual([
      {
        name: "api",
        state: "BLOCKED",
        blockedBy: ["db"],
        reason: 'Startup Dependency "db" failed to become available.',
      },
      {
        name: "worker",
        state: "BLOCKED",
        blockedBy: ["api"],
        reason: 'Startup Dependency "api" failed to become available.',
      },
    ]);
  });
});
