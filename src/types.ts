export type RestartPolicy = "never" | "on-failure" | "always";

export type ServiceState = "STOPPED" | "STARTING" | "RUNNING" | "FAILED" | "STOPPING";

export type CommandSpec = string | string[];

export interface ServiceConfig {
  name: string;
  command: CommandSpec;
  working_dir?: string;
  env?: Record<string, string>;
  restart_policy?: RestartPolicy;
  depends_on?: string[];
}

export interface AppDockerConfig {
  enabled?: boolean;
}

export interface AppConfig {
  docker?: AppDockerConfig;
}

export interface Manifest {
  app?: AppConfig;
  services: ServiceConfig[];
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

export type PanelId = "manifest" | "logs" | "docker";

export type DockerServiceState =
  | "running"
  | "exited"
  | "paused"
  | "restarting"
  | "dead"
  | "created"
  | "removing"
  | "unknown";

export interface DockerService {
  name: string;
  state: DockerServiceState;
  status: string;
  ports: string;
}

export interface Shortcut {
  key: string;
  label: string;
}

export type AppMode = "normal" | "editing" | "adding" | "discovering";
