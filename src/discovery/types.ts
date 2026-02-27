import type { CommandSpec, RestartPolicy, ServiceConfig } from "../types";

export interface ValuePathProbe {
  file: string;
  path: string;
  equals?: string | number | boolean;
}

export interface RegexProbe {
  file: string;
  pattern: string;
  flags?: string;
}

export interface StrategyWhen {
  all_files: string[];
  any_files: string[];
  all_json_paths: ValuePathProbe[];
  any_json_paths: ValuePathProbe[];
  all_toml_paths: ValuePathProbe[];
  any_toml_paths: ValuePathProbe[];
  all_regex: RegexProbe[];
  any_regex: RegexProbe[];
}

interface StrategyCaptureBase {
  name: string;
}

export interface LockfilePackageManagerCapture extends StrategyCaptureBase {
  kind: "lockfile_package_manager";
}

export interface JsonFirstExistingCapture extends StrategyCaptureBase {
  kind: "json_first_existing";
  file: string;
  paths: string[];
}

export interface TomlFirstExistingCapture extends StrategyCaptureBase {
  kind: "toml_first_existing";
  file: string;
  paths: string[];
}

export type StrategyCapture =
  | LockfilePackageManagerCapture
  | JsonFirstExistingCapture
  | TomlFirstExistingCapture;

export interface StrategyServiceTemplate {
  name: string;
  command: CommandSpec;
  working_dir?: string;
  env?: Record<string, string>;
  restart_policy?: RestartPolicy;
  depends_on?: string[];
  depends_on_ids?: string[];
}

export interface DiscoveryStrategy {
  id: string;
  label: string;
  priority: number;
  default_selected: boolean;
  when: StrategyWhen;
  capture: StrategyCapture[];
  service: StrategyServiceTemplate;
}

export interface LoadedStrategies {
  strategies: DiscoveryStrategy[];
  warnings: string[];
}

export interface DetectedCandidate {
  strategyId: string;
  label: string;
  priority: number;
  defaultSelected: boolean;
  service: ServiceConfig;
  dependsOnIds: string[];
}

export interface DetectResult {
  candidates: DetectedCandidate[];
  warnings: string[];
}

export interface SelectionItem {
  candidate: DetectedCandidate;
  selected: boolean;
}

export interface FinalizeSelectionResult {
  services: ServiceConfig[];
  warnings: string[];
}
