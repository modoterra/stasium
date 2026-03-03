import type { ServiceConfig } from "../types";
import type { DetectedCandidate, FinalizeSelectionResult, SelectionItem } from "./types";

export type DiscoverySelectionUpdateCallback = () => void;

interface FinalizeSelectionOptions {
  usedNames?: Iterable<string>;
}

const cloneService = (service: ServiceConfig): ServiceConfig => {
  return {
    name: service.name,
    command: Array.isArray(service.command) ? [...service.command] : service.command,
    working_dir: service.working_dir,
    env: service.env ? { ...service.env } : undefined,
    restart_policy: service.restart_policy,
    depends_on: service.depends_on ? [...service.depends_on] : undefined,
  };
};

const ensureUniqueName = (baseName: string, used: Set<string>): string => {
  if (!used.has(baseName)) return baseName;
  let suffix = 2;
  while (used.has(`${baseName}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
};

export class DiscoverySelection {
  private readonly items: SelectionItem[];
  private cursor = 0;
  private readonly updateCallbacks: Set<DiscoverySelectionUpdateCallback> = new Set();

  constructor(candidates: DetectedCandidate[]) {
    this.items = candidates.map((candidate) => ({
      candidate,
      selected: candidate.defaultSelected,
    }));
  }

  onUpdate(callback: DiscoverySelectionUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  getItems(): SelectionItem[] {
    return this.items.map((item) => ({
      candidate: item.candidate,
      selected: item.selected,
    }));
  }

  getCursor(): number {
    return this.cursor;
  }

  getSelectedCount(): number {
    return this.items.filter((item) => item.selected).length;
  }

  getTotalCount(): number {
    return this.items.length;
  }

  moveCursor(delta: number): void {
    if (this.items.length === 0 || delta === 0) return;
    const length = this.items.length;
    const next = (((this.cursor + delta) % length) + length) % length;
    if (next === this.cursor) return;
    this.cursor = next;
    this.notify();
  }

  toggleCursor(): void {
    const item = this.items[this.cursor];
    if (!item) return;
    item.selected = !item.selected;
    this.notify();
  }

  selectAll(): void {
    let changed = false;
    for (const item of this.items) {
      if (!item.selected) {
        item.selected = true;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  selectNone(): void {
    let changed = false;
    for (const item of this.items) {
      if (item.selected) {
        item.selected = false;
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  getSelectedCandidates(): DetectedCandidate[] {
    return this.items.filter((item) => item.selected).map((item) => item.candidate);
  }

  private notify(): void {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }
}

export const finalizeSelectedCandidates = (
  candidates: DetectedCandidate[],
  options: FinalizeSelectionOptions = {},
): FinalizeSelectionResult => {
  const warnings: string[] = [];
  const services: ServiceConfig[] = [];
  const finalNameByStrategy = new Map<string, string>();
  const usedNames = new Set(options.usedNames ?? []);

  for (const candidate of candidates) {
    const service = cloneService(candidate.service);
    const finalName = ensureUniqueName(service.name, usedNames);
    usedNames.add(finalName);
    service.name = finalName;
    services.push(service);
    finalNameByStrategy.set(candidate.strategyId, finalName);
  }

  candidates.forEach((candidate, index) => {
    const service = services[index];
    if (!service) return;

    const resolved = [...(service.depends_on ?? [])];
    const seen = new Set(resolved);

    for (const dependencyId of candidate.dependsOnIds) {
      const dependencyName = finalNameByStrategy.get(dependencyId);
      if (!dependencyName) {
        continue;
      }
      if (dependencyName === service.name) {
        warnings.push(
          `Service '${service.name}' has a self-reference through dependency id '${dependencyId}'.`,
        );
        continue;
      }
      if (seen.has(dependencyName)) {
        continue;
      }
      resolved.push(dependencyName);
      seen.add(dependencyName);
    }

    service.depends_on = resolved.length > 0 ? resolved : undefined;
  });

  return {
    services,
    warnings,
  };
};

export const finalizeSelection = (
  selection: DiscoverySelection,
  options: FinalizeSelectionOptions = {},
): FinalizeSelectionResult => {
  return finalizeSelectedCandidates(selection.getSelectedCandidates(), options);
};
