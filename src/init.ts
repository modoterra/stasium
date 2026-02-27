import {
  DiscoverySelection,
  detectDiscoveryCandidates,
  finalizeSelectedCandidates,
  finalizeSelection,
  loadDiscoveryStrategies,
} from "./discovery";
import type { DetectResult as DiscoveryDetectResult } from "./discovery";
import { saveManifest } from "./manifest";
import { formatCommandSpec } from "./shared";
import type { ServiceConfig } from "./types";

export type DetectResult = DiscoveryDetectResult;

export { DiscoverySelection, finalizeSelection, finalizeSelectedCandidates };

export const detectServices = async (cwd: string): Promise<DetectResult> => {
  const loaded = await loadDiscoveryStrategies(cwd);
  const detected = await detectDiscoveryCandidates(cwd, loaded.strategies);

  return {
    candidates: detected.candidates,
    warnings: [...loaded.warnings, ...detected.warnings],
  };
};

export const getDefaultServices = (
  detected: DetectResult,
): { services: ServiceConfig[]; warnings: string[] } => {
  const defaults = detected.candidates.filter((candidate) => candidate.defaultSelected);
  return finalizeSelectedCandidates(defaults);
};

export const writeManifest = async (
  manifestPath: string,
  services: ServiceConfig[],
): Promise<void> => {
  await saveManifest(manifestPath, services);
};

export const formatServiceSummary = (service: ServiceConfig): string =>
  `${service.name}: ${formatCommandSpec(service.command)}`;
