import { resolve } from "node:path";
import { normalizeCommand } from "./command";
import type { CommandSpec, RestartPolicy, ServiceConfig } from "./types";

export interface ProcessDefinitionInput {
  name: string;
  command: CommandSpec;
  working_dir?: string;
  env?: Record<string, string>;
  restart_policy?: RestartPolicy;
  depends_on?: string[];
}

export interface NormalizeProcessDefinitionOptions {
  baseDir?: string;
}

export class ProcessDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcessDefinitionError";
  }
}

const normalizeName = (name: string): string => {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new ProcessDefinitionError("service.name must not be empty");
  }
  return normalized;
};

const normalizeWorkingDir = (workingDir: string | undefined, baseDir?: string): string => {
  const raw = workingDir?.trim() ?? ".";
  if (raw.length === 0) {
    throw new ProcessDefinitionError("service.working_dir must not be empty");
  }
  return resolve(baseDir ?? process.cwd(), raw);
};

const normalizeEnv = (env: Record<string, string> | undefined): Record<string, string> => {
  return env ? { ...env } : {};
};

const normalizeDependencies = (dependencies: string[] | undefined): string[] => {
  const normalized: string[] = [];
  for (const dependency of dependencies ?? []) {
    const name = dependency.trim();
    if (name.length === 0) {
      throw new ProcessDefinitionError("service.depends_on must not contain empty names");
    }
    normalized.push(name);
  }
  return normalized;
};

export const normalizeProcessDefinition = (
  input: ProcessDefinitionInput,
  options: NormalizeProcessDefinitionOptions = {},
): ServiceConfig => {
  try {
    return {
      name: normalizeName(input.name),
      command: normalizeCommand(input.command),
      working_dir: normalizeWorkingDir(input.working_dir, options.baseDir),
      env: normalizeEnv(input.env),
      restart_policy: input.restart_policy ?? "never",
      depends_on: normalizeDependencies(input.depends_on),
    };
  } catch (error) {
    if (error instanceof ProcessDefinitionError) throw error;
    throw new ProcessDefinitionError(error instanceof Error ? error.message : String(error));
  }
};

export const normalizeProcessDefinitions = (
  inputs: ProcessDefinitionInput[],
  options: NormalizeProcessDefinitionOptions = {},
): ServiceConfig[] => inputs.map((input) => normalizeProcessDefinition(input, options));
