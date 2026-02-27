import { describe, expect, test } from "bun:test";
import {
  ServiceGraphError,
  getDependencyClosure,
  getDependentsClosure,
  getTopologicalServiceOrder,
  validateServiceGraph,
} from "./service-graph";
import type { ServiceConfig } from "./types";

const baseServices: ServiceConfig[] = [
  {
    name: "api",
    command: ["bun", "run", "dev"],
    depends_on: ["db"],
  },
  {
    name: "db",
    command: ["docker", "compose", "up", "db"],
  },
  {
    name: "worker",
    command: ["bun", "run", "worker"],
    depends_on: ["api"],
  },
];

describe("service graph", () => {
  test("orders services by dependency", () => {
    expect(getTopologicalServiceOrder(baseServices)).toEqual(["db", "api", "worker"]);
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
      {
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["cache"],
      },
    ];

    expect(() => validateServiceGraph(services)).toThrow(ServiceGraphError);
  });

  test("rejects dependency cycles", () => {
    const services: ServiceConfig[] = [
      {
        name: "api",
        command: ["bun", "run", "dev"],
        depends_on: ["worker"],
      },
      {
        name: "worker",
        command: ["bun", "run", "worker"],
        depends_on: ["api"],
      },
    ];

    expect(() => validateServiceGraph(services)).toThrow(ServiceGraphError);
  });
});
