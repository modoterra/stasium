import { describe, expect, test } from "bun:test";
import {
  getDirectManagedRuntimeStatus,
  getExternalRuntimeStatus,
  getRuntimeStatusView,
} from "./runtime-status";

describe("runtime status", () => {
  test("uses user-facing codes for canonical statuses", () => {
    expect(getRuntimeStatusView("running")).toMatchObject({ code: "Run", label: "running" });
    expect(getRuntimeStatusView("retrying")).toMatchObject({ code: "Rty", label: "retrying" });
    expect(getRuntimeStatusView("errored")).toMatchObject({ code: "Err", label: "errored" });
    expect(getRuntimeStatusView("blocked")).toMatchObject({ code: "Blk", label: "blocked" });
    expect(getRuntimeStatusView("paused")).toMatchObject({ code: "Pau", label: "paused" });
    expect(getRuntimeStatusView("unknown")).toMatchObject({ code: "Unk", label: "unknown" });
  });

  test("normalizes direct-managed service states", () => {
    expect(getDirectManagedRuntimeStatus("RUNNING", null)).toBe("running");
    expect(getDirectManagedRuntimeStatus("STARTING", null)).toBe("starting");
    expect(getDirectManagedRuntimeStatus("STOPPING", null)).toBe("stopping");
    expect(getDirectManagedRuntimeStatus("FAILED", null)).toBe("errored");
    expect(getDirectManagedRuntimeStatus("BLOCKED", null)).toBe("blocked");
    expect(getDirectManagedRuntimeStatus("STOPPED", null)).toBe("off");
    expect(getDirectManagedRuntimeStatus("FAILED", 250)).toBe("retrying");
  });

  test("normalizes external runtime states", () => {
    expect(getExternalRuntimeStatus("running")).toBe("running");
    expect(getExternalRuntimeStatus("restarting")).toBe("retrying");
    expect(getExternalRuntimeStatus("dead")).toBe("errored");
    expect(getExternalRuntimeStatus("paused")).toBe("paused");
    expect(getExternalRuntimeStatus("created")).toBe("off");
    expect(getExternalRuntimeStatus("exited")).toBe("off");
    expect(getExternalRuntimeStatus("unknown")).toBe("unknown");
  });
});
