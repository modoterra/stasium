import type { ExternalManagedProcessState, RuntimeStatus, ServiceState } from "./types";

export interface RuntimeStatusView {
  status: RuntimeStatus;
  code: string;
  label: string;
  severity: "good" | "attention" | "bad" | "muted";
}

export const getRuntimeStatusView = (status: RuntimeStatus): RuntimeStatusView => {
  switch (status) {
    case "running":
      return { status, code: "Run", label: "running", severity: "good" };
    case "retrying":
      return { status, code: "Rty", label: "retrying", severity: "attention" };
    case "errored":
      return { status, code: "Err", label: "errored", severity: "bad" };
    case "blocked":
      return { status, code: "Blk", label: "blocked", severity: "attention" };
    case "starting":
      return { status, code: "Str", label: "starting", severity: "attention" };
    case "stopping":
      return { status, code: "Stp", label: "stopping", severity: "attention" };
    case "off":
      return { status, code: "Off", label: "off", severity: "muted" };
    case "paused":
      return { status, code: "Pau", label: "paused", severity: "attention" };
    case "unknown":
      return { status, code: "Unk", label: "unknown", severity: "muted" };
  }
};

export const getDirectManagedRuntimeStatus = (
  state: ServiceState,
  restartInMs: number | null,
): RuntimeStatus => {
  if (restartInMs !== null) return "retrying";

  switch (state) {
    case "RUNNING":
      return "running";
    case "STARTING":
      return "starting";
    case "STOPPING":
      return "stopping";
    case "FAILED":
      return "errored";
    case "BLOCKED":
      return "blocked";
    case "STOPPED":
      return "off";
  }
};

export const getExternalRuntimeStatus = (state: ExternalManagedProcessState): RuntimeStatus => {
  switch (state) {
    case "running":
      return "running";
    case "restarting":
      return "retrying";
    case "paused":
      return "paused";
    case "dead":
      return "errored";
    case "created":
    case "removing":
      return "starting";
    case "exited":
      return "off";
    case "unknown":
      return "unknown";
  }
};
