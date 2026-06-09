import { describe, expect, test } from "bun:test";
import { ExternalRuntimeSession } from "./external-runtime";
import { getExternalRuntimeStatus } from "./runtime-status";
import type { ExternalManagedProcess } from "./types";

describe("External Runtime Session", () => {
  test("tracks session-started External Managed Processes separately from snapshots", () => {
    const session = new ExternalRuntimeSession();

    session.trackStarted(process("docker-compose", "db"));

    expect(session.startedProcesses()).toEqual([
      { key: "docker-compose:db", runtimeId: "docker-compose", name: "db" },
    ]);
  });

  test("forgets session-started External Managed Processes after cleanup", () => {
    const session = new ExternalRuntimeSession();
    session.trackStarted(process("docker-compose", "db"));

    session.forget("docker-compose:db");

    expect(session.startedProcesses()).toEqual([]);
  });
});

const process = (runtimeId: string, name: string): ExternalManagedProcess => ({
  runtimeId,
  runtimeName: runtimeId,
  name,
  state: "running",
  runtimeStatus: getExternalRuntimeStatus("running"),
  status: "Up",
  ports: "",
});
