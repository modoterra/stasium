import { resolve } from "node:path";
import { loadManifest } from "./manifest";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager } from "./service-manager";
import { getErrorMessage } from "./shared";
import type { CommandContext, CommandResult } from "./cli";
import type { ProcessDefinition, ServiceState } from "./types";

export interface LifecycleStatus {
  name: string;
  state: ServiceState | "UNKNOWN";
}

export interface LifecycleOperations {
  start: (name?: string) => Promise<string[]>;
  status: () => Promise<LifecycleStatus[]>;
}

export interface LifecycleCommandOptions {
  cwd?: string;
  manifestPath?: string;
  operations?: LifecycleOperations;
}

const findProcessDefinition = (processDefinitions: ProcessDefinition[], name: string): number =>
  processDefinitions.findIndex((processDefinition) => processDefinition.name === name);

const createDefaultOperations = (options: LifecycleCommandOptions): LifecycleOperations => {
  const cwd = options.cwd ?? process.cwd();
  const manifestPath = options.manifestPath ?? resolve(cwd, "stasium.toml");

  return {
    start: async (name) => {
      const manifest = await loadManifest(manifestPath);
      const manager = new ServiceManager(manifest.services, {
        processClaimStore: new ProcessClaimStore(cwd),
      });

      if (name) {
        const index = findProcessDefinition(manifest.services, name);
        if (index === -1) throw new Error(`Unknown Managed Process: ${name}`);
        manager.setSelectedIndex(index);
        await manager.startSelected();
        return manager.getServicePids().map((pid) => pid.name);
      }

      await manager.startAll();
      return manager.getServicePids().map((pid) => pid.name);
    },
    status: async () => {
      const manifest = await loadManifest(manifestPath);
      return manifest.services.map((processDefinition) => ({
        name: processDefinition.name,
        state: "UNKNOWN",
      }));
    },
  };
};

export const runStartCommand = async (
  args: string[],
  context: CommandContext,
  options: LifecycleCommandOptions = {},
): Promise<CommandResult> => {
  if (args.length > 1) {
    context.stderr("Usage: stasium start [managed-process-name]");
    return { exitCode: 1 };
  }

  try {
    const started = await (options.operations ?? createDefaultOperations(options)).start(args[0]);
    if (started.length === 0) {
      context.stdout("No Direct Managed Processes started.");
    } else {
      for (const name of started) context.stdout(`Started ${name}.`);
    }
    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};

export const runStatusCommand = async (
  args: string[],
  context: CommandContext,
  options: LifecycleCommandOptions = {},
): Promise<CommandResult> => {
  if (args.length > 0) {
    context.stderr("Usage: stasium status");
    return { exitCode: 1 };
  }

  try {
    const statuses = await (options.operations ?? createDefaultOperations(options)).status();
    if (statuses.length === 0) {
      context.stdout("No Managed Processes found.");
    } else {
      for (const status of statuses) context.stdout(`${status.name}: ${status.state}`);
    }
    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};
