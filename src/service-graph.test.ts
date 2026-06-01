import { describe, expect, test } from "bun:test";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import {
  ServiceGraphError,
  getDependencyClosure,
  getDependentsClosure,
  getTopologicalServiceLayers,
  getTopologicalServiceOrder,
  validateServiceGraph,
} from "./service-graph";
import type { ServiceConfig } from "./types";

const service = (input: ProcessDefinitionInput): ServiceConfig => normalizeProcessDefinition(input);

const baseServices: ServiceConfig[] = [
  service({
    name: "api",
    command: ["bun", "run", "dev"],
    depends_on: ["db"],
  }),
  service({
    name: "db",
    command: ["docker", "compose", "up", "db"],
  }),
  service({
    name: "worker",
    command: ["bun", "run", "worker"],
    depends_on: ["api"],
  }),
];

describe("service graph", () => {
  test("orders services by dependency", () => {
    expect(getTopologicalServiceOrder(baseServices)).toEqual(["db", "api", "worker"]);
  });

  test("groups services into dependency layers", () => {
    expect(getTopologicalServiceLayers(baseServices)).toEqual([["db"], ["api"], ["worker"]]);
    expect(
      getTopologicalServiceLayers([
        service({ name: "db", command: ["bun", "--version"] }),
        service({ name: "cache", command: ["bun", "--version"] }),
        service({ name: "api", command: ["bun", "--version"], depends_on: ["db", "cache"] }),
      ]),
    ).toEqual([["db", "cache"], ["api"]]);
  });

  test("returns dependency closure for a target service", () => {
    const closure = getDependencyClosure(baseServices, "worker");
    expect(closure.has("worker")).toBe(true);
    expect(closure.has("api")).toBe(true);
    expect(closure.has("db")).toBe(true);
    expect(closure.size).toBe(3);
  });

  test("returns dependents closure for a target service", () => {
    const closure = getDependentsClosure(baseServices, "db");
    expect(closure.has("db")).toBe(true);
    expect(closure.has("api")).toBe(true);
    expect(closure.has("worker")).toBe(true);
    expect(closure.size).toBe(3);
  });

  test("rejects unknown dependencies", () => {
    const services: ServiceConfig[] = [
      service({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["cache"],
      }),
    ];

    expect(() => validateServiceGraph(services)).toThrow(ServiceGraphError);
  });

  test("validates direct-only Startup Dependencies explicitly", () => {
    const services: ServiceConfig[] = [
      service({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["cache"],
      }),
    ];

    expect(() =>
      validateServiceGraph(services, {
        startupDependencyValidation: { mode: "direct-only" },
      }),
    ).toThrow(ServiceGraphError);
  });

  test("accepts named cross-runtime Startup Dependencies", () => {
    const services: ServiceConfig[] = [
      service({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["docker:db"],
      }),
    ];

    expect(() =>
      validateServiceGraph(services, {
        startupDependencyValidation: {
          mode: "cross-runtime",
          externalManagedProcessNames: ["docker:db"],
        },
      }),
    ).not.toThrow();
  });

  test("rejects unresolved cross-runtime Startup Dependencies", () => {
    const services: ServiceConfig[] = [
      service({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["docker:db"],
      }),
    ];

    expect(() =>
      validateServiceGraph(services, {
        startupDependencyValidation: {
          mode: "cross-runtime",
          externalManagedProcessNames: ["docker:cache"],
        },
      }),
    ).toThrow(ServiceGraphError);
  });

  test("rejects dependency cycles", () => {
    const services: ServiceConfig[] = [
      service({
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["worker"],
      }),
      service({
        name: "worker",
        command: ["bun", "run", "worker"],
        depends_on: ["api"],
      }),
    ];

    expect(() => validateServiceGraph(services)).toThrow(ServiceGraphError);
  });
});
