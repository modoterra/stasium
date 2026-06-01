import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDockerComposeExternalRuntimeAdapter, getStableDockerServiceNames } from "./docker";

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

describe("createDockerComposeExternalRuntimeAdapter", () => {
  test("detects Docker Compose as an External Runtime for a Project", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-compose-"));
    try {
      await writeFile(join(dir, "compose.yml"), "services:\n  db:\n    image: postgres\n");

      const runtime = await createDockerComposeExternalRuntimeAdapter().detect(dir);

      expect(runtime?.id).toBe("docker-compose");
      expect(runtime?.name).toBe("Docker Compose");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
