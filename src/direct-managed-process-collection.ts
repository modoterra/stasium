import { getDependencyClosure, getDependentsClosure } from "./service-graph";
import { planStartupDependencies } from "./startup-dependency-plan";
import type { ServiceConfig } from "./types";

export class DirectManagedProcessCollectionLifecycle {
  private readonly getConfigs: () => ServiceConfig[];

  constructor(getConfigs: () => ServiceConfig[]) {
    this.getConfigs = getConfigs;
  }

  validate(configs: ServiceConfig[]): void {
    planStartupDependencies(configs);
  }

  startupLayers(): string[][] {
    return planStartupDependencies(this.getConfigs()).startupLayers;
  }

  startupOrder(): string[] {
    return planStartupDependencies(this.getConfigs()).startupOrder;
  }

  shutdownOrder(): string[] {
    return planStartupDependencies(this.getConfigs()).shutdownOrder;
  }

  startOrderFor(name: string): string[] {
    const configs = this.getConfigs();
    const closure = getDependencyClosure(configs, name);
    return this.startupOrder().filter((processName) => closure.has(processName));
  }

  stopOrderFor(name: string): string[] {
    const configs = this.getConfigs();
    const closure = getDependentsClosure(configs, name);
    return this.startupOrder()
      .filter((processName) => closure.has(processName))
      .reverse();
  }
}
