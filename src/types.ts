export type RestartPolicy = "never" | "on-failure" | "always";

export type ServiceState =
  | "STOPPED"
  | "STARTING"
  | "RUNNING"
  | "FAILED"
  | "STOPPING";

export type CommandSpec = string | string[];

export interface ServiceConfig {
  name: string;
  command: CommandSpec;
  working_dir?: string;
  env?: Record<string, string>;
  restart_policy?: RestartPolicy;
  depends_on?: string[];
}

export interface Manifest {
  services: ServiceConfig[];
  path: string;
}

export interface LogEntry {
  timestamp: string;
  line: string;
  stream: "stdout" | "stderr";
}
