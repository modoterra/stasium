import { describe, expect, test } from "bun:test";
import { getStableDockerServiceNames } from "./docker";

describe("getStableDockerServiceNames", () => {
  test("sorts docker service names alphabetically and appends discovered extras", () => {
    expect(getStableDockerServiceNames(["worker", "api"], ["zulu", "api", "db"])).toEqual([
      "api",
      "db",
      "worker",
      "zulu",
    ]);
  });

  test("sorts discovered names when compose config is unavailable", () => {
    expect(getStableDockerServiceNames([], ["worker", "api", "db"])).toEqual([
      "api",
      "db",
      "worker",
    ]);
  });
});
