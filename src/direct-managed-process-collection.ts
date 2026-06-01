import { getDependencyClosure, getDependentsClosure } from "./service-graph";
import { planStartupDependencies } from "./startup-dependency-plan";
import type { ServiceConfig } from "./types";

export interface DirectManagedProcessCollectionLifecycleOptions {
  allowExternalDependencies?: boolean;
}

export interface DirectManagedProcessCollection {
  validate(configs: ServiceConfig[]): void;
  startupLayers(): string[][];
  startupOrder(): string[];
  shutdownOrder(): string[];
  startOrderFor(name: string): string[];
  stopOrderFor(name: string): string[];
}

export class DirectManagedProcessCollectionLifecycle implements DirectManagedProcessCollection {
  private readonly getConfigs: () => ServiceConfig[];
  private readonly options: DirectManagedProcessCollectionLifecycleOptions;

  constructor(
    getConfigs: () => ServiceConfig[],
    options: DirectManagedProcessCollectionLifecycleOptions = {},
  ) {
    this.getConfigs = getConfigs;
    this.options = options;
  }

  validate(configs: ServiceConfig[]): void {
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
