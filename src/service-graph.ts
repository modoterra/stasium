import type { ServiceConfig } from "./types";

export class ServiceGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceGraphError";
  }
}

const dependenciesOf = (service: ServiceConfig): string[] => service.depends_on ?? [];

const buildServiceMap = (services: ServiceConfig[]): Map<string, ServiceConfig> => {
  const byName = new Map<string, ServiceConfig>();

  for (const service of services) {
    if (byName.has(service.name)) {
      throw new ServiceGraphError(`Duplicate service name: ${service.name}`);
    }
    byName.set(service.name, service);
  }

  return byName;
};

const findCycle = (servicesByName: Map<string, ServiceConfig>): string[] | null => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (name: string): string[] | null => {
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      const cycle = start >= 0 ? stack.slice(start) : [name];
      cycle.push(name);
      return cycle;
    }

    if (visited.has(name)) return null;

    visiting.add(name);
    stack.push(name);

    const service = servicesByName.get(name);
    if (service) {
      for (const dependency of dependenciesOf(service)) {
        const cycle = visit(dependency);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    visiting.delete(name);
    visited.add(name);
    return null;
  };

  for (const name of servicesByName.keys()) {
    const cycle = visit(name);
    if (cycle) return cycle;
  }

  return null;
};

export const validateServiceGraph = (services: ServiceConfig[]): void => {
  const servicesByName = buildServiceMap(services);

  for (const service of services) {
    for (const dependency of dependenciesOf(service)) {
      if (!servicesByName.has(dependency)) {
        throw new ServiceGraphError(
          `Service "${service.name}" depends on unknown service "${dependency}"`,
        );
      }
      if (dependency === service.name) {
        throw new ServiceGraphError(`Service "${service.name}" cannot depend on itself`);
      }
    }
  }

  const cycle = findCycle(servicesByName);
  if (cycle) {
    throw new ServiceGraphError(`Dependency cycle detected: ${cycle.join(" -> ")}`);
  }
};

export const getTopologicalServiceOrder = (services: ServiceConfig[]): string[] => {
  validateServiceGraph(services);

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const service of services) {
    indegree.set(service.name, 0);
    dependents.set(service.name, []);
  }

  for (const service of services) {
    for (const dependency of dependenciesOf(service)) {
      indegree.set(service.name, (indegree.get(service.name) ?? 0) + 1);
      const list = dependents.get(dependency);
      if (list) {
        list.push(service.name);
      }
    }
  }

  const queue = services
    .map((service) => service.name)
    .filter((name) => (indegree.get(name) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name) continue;

    ordered.push(name);
    for (const dependent of dependents.get(name) ?? []) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        queue.push(dependent);
      }
    }
  }

  if (ordered.length !== services.length) {
    throw new ServiceGraphError("Dependency cycle detected");
  }

  return ordered;
};

export const getDependencyClosure = (services: ServiceConfig[], target: string): Set<string> => {
  validateServiceGraph(services);

  const byName = buildServiceMap(services);
  if (!byName.has(target)) {
    throw new ServiceGraphError(`Unknown service: ${target}`);
  }

  const closure = new Set<string>();

  const visit = (name: string): void => {
    if (closure.has(name)) return;
    closure.add(name);

    const service = byName.get(name);
    if (!service) return;

    for (const dependency of dependenciesOf(service)) {
      visit(dependency);
    }
  };

  visit(target);
  return closure;
};

export const getDependentsClosure = (services: ServiceConfig[], target: string): Set<string> => {
  validateServiceGraph(services);

  const byName = buildServiceMap(services);
  if (!byName.has(target)) {
    throw new ServiceGraphError(`Unknown service: ${target}`);
  }

  const dependents = new Map<string, string[]>();
  for (const service of services) {
    dependents.set(service.name, []);
  }

  for (const service of services) {
    for (const dependency of dependenciesOf(service)) {
      const list = dependents.get(dependency);
      if (list) {
        list.push(service.name);
      }
    }
  }

  const closure = new Set<string>();
  const visit = (name: string): void => {
    if (closure.has(name)) return;
    closure.add(name);
    for (const dependent of dependents.get(name) ?? []) {
      visit(dependent);
    }
  };

  visit(target);
  return closure;
};
