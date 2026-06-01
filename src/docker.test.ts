import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDockerComposeExternalRuntimeAdapter, getStableDockerServiceNames } from "./docker";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const streamFrom = (text: string): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      if (text.length > 0) controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

const installFakeDockerSpawn = (commands: string[]): (() => void) => {
  const originalSpawn = Bun.spawn;
  Bun.spawn = ((options: { cmd: string[] }) => {
    const command = options.cmd.join(" ");
    commands.push(command);

    let stdout = "";
    let exitCode = 0;
    if (command.includes("config --services")) {
      stdout = "api\ndb\n";
    } else if (command.includes("ps --format json -a")) {
      stdout = [
        '{"Service":"db","State":"running","Status":"Up","Ports":"5432"}',
        '{"Service":"api","State":"exited","Status":"Exited","Ports":""}',
      ].join("\n");
    } else if (command.includes("restart db")) {
      exitCode = 1;
    } else if (command.includes("logs -f --tail=200 db")) {
      stdout = "line one\nline two\n";
    }

    return {
      stdout: streamFrom(stdout),
      stderr: streamFrom(""),
      exited: Promise.resolve(exitCode),
      kill: () => {},
    } as Bun.Subprocess;
  }) as typeof Bun.spawn;

  return () => {
    Bun.spawn = originalSpawn;
  };
};

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

  test("localizes state, lifecycle, and output behavior inside the adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-compose-"));
    const commands: string[] = [];
    const restoreSpawn = installFakeDockerSpawn(commands);

    try {
      await writeFile(join(dir, "compose.yml"), "services:\n  db:\n    image: postgres\n");

      const runtime = await createDockerComposeExternalRuntimeAdapter().detect(dir);
      if (!runtime) throw new Error("Expected Docker Compose runtime");

      const snapshot = await runtime.snapshot();
      expect(snapshot).toEqual([
        {
          runtimeId: "docker-compose",
          runtimeName: "Docker Compose",
          name: "api",
          state: "exited",
          status: "Exited",
          ports: "",
        },
        {
          runtimeId: "docker-compose",
          runtimeName: "Docker Compose",
          name: "db",
          state: "running",
          status: "Up",
          ports: "5432",
        },
      ]);
      expect(runtime.isAvailable(snapshot[1]!)).toBe(true);
      expect(runtime.isAvailable(snapshot[0]!)).toBe(false);

      await runtime.start?.("db");
      await runtime.stop("db");
      await runtime.restart("db");

      const output: string[] = [];
      const stream = runtime.streamOutput("db", (entry) =>
        output.push(`${entry.stream}:${entry.line}`),
      );
      await delay(50);
      stream?.stop();

      expect(output).toEqual(["stdout:line one", "stdout:line two"]);
      expect(commands).toContain(`docker compose -f ${join(dir, "compose.yml")} up -d db`);
      expect(commands).toContain(`docker compose -f ${join(dir, "compose.yml")} stop db`);
      expect(commands).toContain(`docker compose -f ${join(dir, "compose.yml")} restart db`);
      expect(commands).toContain(
        `docker compose -f ${join(dir, "compose.yml")} logs -f --tail=200 db`,
      );
    } finally {
      restoreSpawn();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
