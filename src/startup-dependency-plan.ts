import {
  ServiceGraphError,
  type ServiceGraphOptions,
  getTopologicalServiceLayers,
  getTopologicalServiceOrder,
  validateServiceGraph,
} from "./service-graph";
import type { ProcessDefinition } from "./types";

export type BlockedProcessState = {
  name: string;
  state: "BLOCKED";
  blockedBy: string[];
  reason: string;
};

export interface StartupDependencyPlan {
  processDefinitions: ProcessDefinition[];
  startupOrder: string[];
  startupLayers: string[][];
  shutdownOrder: string[];
  blockedStatesFor: (unavailableNames: Iterable<string>) => BlockedProcessState[];
}

export interface StartupDependencyPlanOptions extends ServiceGraphOptions {
  allowExternalDependencies?: boolean;
}

export class StartupDependencyPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupDependencyPlanError";
  }
}

const toPlanningError = (error: unknown): never => {
  if (error instanceof ServiceGraphError) {
    throw new StartupDependencyPlanError(error.message);
  }
  throw error;
};

const cloneProcessDefinitions = (processDefinitions: ProcessDefinition[]): ProcessDefinition[] =>
  processDefinitions.map((processDefinition) => ({
    name: processDefinition.name,
    command: [...processDefinition.command],
    working_dir: processDefinition.working_dir,
    env: { ...processDefinition.env },
    restart_policy: processDefinition.restart_policy,
    depends_on: [...processDefinition.depends_on],
    launchInstruction: { ...processDefinition.launchInstruction },
    workingDir: processDefinition.workingDir,
    environment: { ...processDefinition.environment },
    startupDependencies: [...processDefinition.startupDependencies],
    restartRule: processDefinition.restartRule,
  }));

export const planStartupDependencies = (
  processDefinitions: ProcessDefinition[],
  options: StartupDependencyPlanOptions = {},
): StartupDependencyPlan => {
  const cloned = cloneProcessDefinitions(processDefinitions);

  try {
    validateServiceGraph(cloned, options);
    const startupOrder = getTopologicalServiceOrder(cloned, options);
    const plan: StartupDependencyPlan = {
      processDefinitions: cloned,
      startupOrder,
      startupLayers: getTopologicalServiceLayers(cloned, options),
      shutdownOrder: [...startupOrder].reverse(),
      blockedStatesFor: (unavailableNames) => getBlockedProcessStates(plan, unavailableNames),
    };
    return plan;
  } catch (error) {
    toPlanningError(error);
  }
  throw new StartupDependencyPlanError("Invalid Startup Dependency plan");
};

export const getBlockedProcessStates = (
  plan: StartupDependencyPlan,
  unavailableNames: Iterable<string>,
): BlockedProcessState[] => {
  const unavailable = new Set(unavailableNames);
  const blocked: BlockedProcessState[] = [];
  const byName = new Map(
    plan.processDefinitions.map((processDefinition) => [processDefinition.name, processDefinition]),
  );

  for (const name of plan.startupOrder) {
    if (unavailable.has(name)) continue;

    const processDefinition = byName.get(name);
    if (!processDefinition) continue;

    const blockedBy = processDefinition.startupDependencies.filter((dependency) =>
      unavailable.has(dependency),
    );
    if (blockedBy.length === 0) continue;

    unavailable.add(name);
    blocked.push({
      name,
      state: "BLOCKED",
      blockedBy,
      reason: `Startup Dependency ${blockedBy.map((dependency) => `"${dependency}"`).join(", ")} failed to become available.`,
    });
  }

  return blocked;
};
