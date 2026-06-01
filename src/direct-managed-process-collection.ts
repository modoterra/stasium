import { getDependencyClosure, getDependentsClosure } from "./service-graph";
import {
  planStartupDependencies,
  type StartupDependencyPlanOptions,
} from "./startup-dependency-plan";
import type { ProcessDefinition } from "./types";

export interface DirectManagedProcessCollectionLifecycleOptions extends StartupDependencyPlanOptions {
  allowExternalDependencies?: boolean;
}

export interface DirectManagedProcessCollection {
  validate(configs: ProcessDefinition[]): void;
  startupLayers(): string[][];
  startupOrder(): string[];
  shutdownOrder(): string[];
  startOrderFor(name: string): string[];
  stopOrderFor(name: string): string[];
}

export class DirectManagedProcessCollectionLifecycle implements DirectManagedProcessCollection {
  private readonly getConfigs: () => ProcessDefinition[];
  private readonly options: DirectManagedProcessCollectionLifecycleOptions;

  constructor(
    getConfigs: () => ProcessDefinition[],
    options: DirectManagedProcessCollectionLifecycleOptions = {},
  ) {
    this.getConfigs = getConfigs;
    this.options = options;
  }

  validate(configs: ProcessDefinition[]): void {
    planStartupDependencies(configs, this.options);
  }

  startupLayers(): string[][] {
    return planStartupDependencies(this.getConfigs(), this.options).startupLayers;
  }

  startupOrder(): string[] {
    return planStartupDependencies(this.getConfigs(), this.options).startupOrder;
  }

  shutdownOrder(): string[] {
    return planStartupDependencies(this.getConfigs(), this.options).shutdownOrder;
  }

  startOrderFor(name: string): string[] {
    const configs = this.getConfigs();
    const closure = getDependencyClosure(configs, name, this.options);
    return this.startupOrder().filter((processName) => closure.has(processName));
  }

  stopOrderFor(name: string): string[] {
    const configs = this.getConfigs();
    const closure = getDependentsClosure(configs, name, this.options);
    return this.startupOrder()
      .filter((processName) => closure.has(processName))
      .reverse();
  }
}
