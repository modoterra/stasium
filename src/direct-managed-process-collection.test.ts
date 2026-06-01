import { describe, expect, test } from "bun:test";
import {
  DirectManagedProcessCollectionLifecycle,
  type DirectManagedProcessCollection,
} from "./direct-managed-process-collection";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import type { ProcessDefinition } from "./types";

const processDefinition = (input: ProcessDefinitionInput): ProcessDefinition =>
  normalizeProcessDefinition(input);

const processDefinitions = (): ProcessDefinition[] => [
  processDefinition({ name: "db", launchInstruction: ["bun", "run", "db"] }),
  processDefinition({
    name: "api",
    launchInstruction: ["bun", "run", "dev"],
    startupDependencies: ["db"],
  }),
  processDefinition({
    name: "worker",
    launchInstruction: ["bun", "run", "worker"],
    startupDependencies: ["api"],
  }),
];

describe("Direct Managed Process collection", () => {
  test("exposes Startup and Shutdown ordering through a collection interface", () => {
    const collection: DirectManagedProcessCollection = new DirectManagedProcessCollectionLifecycle(
      processDefinitions,
    );

    expect(collection.startupOrder()).toEqual(["db", "api", "worker"]);
    expect(collection.startupLayers()).toEqual([["db"], ["api"], ["worker"]]);
    expect(collection.shutdownOrder()).toEqual(["worker", "api", "db"]);
  });

  test("computes collection-level start and stop orders for one Direct Managed Process", () => {
    const collection: DirectManagedProcessCollection = new DirectManagedProcessCollectionLifecycle(
      processDefinitions,
    );

    expect(collection.startOrderFor("worker")).toEqual(["db", "api", "worker"]);
    expect(collection.stopOrderFor("db")).toEqual(["worker", "api", "db"]);
  });

  test("validates collection mutations before callers apply them", () => {
    const collection: DirectManagedProcessCollection = new DirectManagedProcessCollectionLifecycle(
      processDefinitions,
    );

    expect(() =>
      collection.validate([
        processDefinition({
          name: "api",
          launchInstruction: ["bun", "run", "dev"],
          startupDependencies: ["db"],
        }),
      ]),
    ).toThrow();
  });
});
