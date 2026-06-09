export type RestartPolicy = "never" | "on-failure" | "always";

export type ServiceState = "STOPPED" | "STARTING" | "RUNNING" | "FAILED" | "STOPPING" | "BLOCKED";

export type RuntimeStatus =
  | "running"
  | "retrying"
  | "errored"
  | "blocked"
  | "starting"
  | "stopping"
  | "off"
  | "paused"
  | "unknown";

export type CommandSpec = string | string[];

export interface LaunchInstruction {
  executable: string;
  arguments: string[];
}

export type RestartRule = RestartPolicy;

export type StartupDependency = string;

export interface ServiceConfig {
  name: string;
  command: string[];
  working_dir: string;
  env: Record<string, string>;
  restart_policy: RestartPolicy;
  depends_on: string[];
}

export interface ProcessDefinition extends ServiceConfig {
  launchInstruction: LaunchInstruction;
  workingDir: string;
  environment: Record<string, string>;
  startupDependencies: StartupDependency[];
  restartRule: RestartRule;
}

export interface AppDockerConfig {
  enabled?: boolean;
}

export interface AppConfig {
  docker?: AppDockerConfig;
}

export interface Manifest {
  app?: AppConfig;
  services: ProcessDefinition[];
  path: string;
}

export interface LogEntry {
  timestamp: string;
  line: string;
  stream: "stdout" | "stderr";
}

export interface ServicePid {
  name: string;
  pid: number;
  command: string[];
  workingDir: string;
  startedAt: string;
  identityVerified: boolean;
}

export type PanelId = "manifest" | "logs" | "external";

export type ExternalManagedProcessState =
  | "running"
  | "exited"
  | "paused"
  | "restarting"
  | "dead"
  | "created"
  | "removing"
  | "unknown";

export interface ExternalManagedProcess {
  runtimeId: string;
  runtimeName: string;
  name: string;
  state: ExternalManagedProcessState;
  runtimeStatus: RuntimeStatus;
  status: string;
  ports: string;
}

export interface Shortcut {
  key: string;
  label: string;
}

export type AppMode = "normal" | "editing" | "adding" | "discovering";
