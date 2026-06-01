import { resolve } from "node:path";
import { normalizeCommand } from "./command";
import type { CommandSpec, LaunchInstruction, ProcessDefinition, RestartPolicy } from "./types";

export interface ProcessDefinitionInput {
  name: string;
  launchInstruction: CommandSpec;
  workingDir?: string;
  environment?: Record<string, string>;
  restartRule?: RestartPolicy;
  startupDependencies?: string[];
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

const toLaunchInstruction = (command: string[]): LaunchInstruction => ({
  executable: command[0] ?? "",
  arguments: command.slice(1),
});

export const normalizeProcessDefinition = (
  input: ProcessDefinitionInput,
  options: NormalizeProcessDefinitionOptions = {},
): ProcessDefinition => {
  try {
    const command = normalizeCommand(input.launchInstruction);
    const workingDir = normalizeWorkingDir(input.workingDir, options.baseDir);
    const environment = normalizeEnv(input.environment);
    const restartPolicy = input.restartRule ?? "never";
    const startupDependencies = normalizeDependencies(input.startupDependencies);

    return {
      name: normalizeName(input.name),
      command,
      working_dir: workingDir,
      env: environment,
      restart_policy: restartPolicy,
      depends_on: startupDependencies,
      launchInstruction: toLaunchInstruction(command),
      workingDir,
      environment,
      startupDependencies,
      restartRule: restartPolicy,
    };
  } catch (error) {
    if (error instanceof ProcessDefinitionError) throw error;
    throw new ProcessDefinitionError(error instanceof Error ? error.message : String(error));
  }
};

export const normalizeProcessDefinitions = (
  inputs: ProcessDefinitionInput[],
  options: NormalizeProcessDefinitionOptions = {},
): ProcessDefinition[] => inputs.map((input) => normalizeProcessDefinition(input, options));
