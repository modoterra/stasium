import { describe, expect, test } from "bun:test";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import {
  StartupDependencyPlanError,
  getBlockedProcessStates,
  planStartupDependencies,
} from "./startup-dependency-plan";
import type { ProcessDefinition } from "./types";

const processDefinition = (input: ProcessDefinitionInput): ProcessDefinition =>
  normalizeProcessDefinition(input);

describe("Startup Dependency planning", () => {
  test("computes Startup order and reverse Shutdown order", () => {
    const plan = planStartupDependencies([
      processDefinition({
        name: "api",
        launchInstruction: ["bun", "run", "dev"],
        startupDependencies: ["db"],
      }),
      processDefinition({ name: "db", launchInstruction: ["bun", "run", "db"] }),
      processDefinition({
        name: "worker",
        launchInstruction: ["bun", "run", "worker"],
        startupDependencies: ["api"],
      }),
    ]);

    expect(plan.startupOrder).toEqual(["db", "api", "worker"]);
    expect(plan.shutdownOrder).toEqual(["worker", "api", "db"]);
    expect(plan.startupLayers).toEqual([["db"], ["api"], ["worker"]]);
  });

  test("validates duplicate names, unknown dependencies, self-dependencies, and cycles", () => {
    expect(() =>
      planStartupDependencies([
        processDefinition({ name: "api", launchInstruction: ["bun", "run", "dev"] }),
        processDefinition({ name: "api", launchInstruction: ["bun", "run", "worker"] }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({
          name: "api",
          launchInstruction: ["bun", "run", "dev"],
          startupDependencies: ["db"],
        }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({
          name: "api",
          launchInstruction: ["bun", "run", "dev"],
          startupDependencies: ["api"],
        }),
      ]),
    ).toThrow(StartupDependencyPlanError);

    expect(() =>
      planStartupDependencies([
        processDefinition({
          name: "api",
          launchInstruction: ["bun", "run", "dev"],
          startupDependencies: ["worker"],
        }),
        processDefinition({
          name: "worker",
          launchInstruction: ["bun", "run", "worker"],
          startupDependencies: ["api"],
        }),
      ]),
    ).toThrow(StartupDependencyPlanError);
  });

  test("represents blocked Process State when Startup Dependencies fail", () => {
    const plan = planStartupDependencies([
      processDefinition({ name: "db", launchInstruction: ["bun", "run", "db"] }),
      processDefinition({ name: "cache", launchInstruction: ["bun", "run", "cache"] }),
      processDefinition({
        name: "api",
        launchInstruction: ["bun", "run", "dev"],
        startupDependencies: ["db", "cache"],
      }),
      processDefinition({
        name: "worker",
        launchInstruction: ["bun", "run", "worker"],
        startupDependencies: ["api"],
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
    expect(plan.blockedStatesFor(["db"])).toEqual(getBlockedProcessStates(plan, ["db"]));
  });
});
