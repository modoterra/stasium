import { finalizeSelection, type DiscoverySelection } from "./discovery";
import { writeManifest } from "./init";
import type { ServiceConfig } from "./types";

export interface ProjectSetupResult {
  services: ServiceConfig[];
  warnings: string[];
}

export const createProjectManifest = async (
  manifestPath: string,
  selection: DiscoverySelection | null,
): Promise<ProjectSetupResult> => {
  const finalized = selection ? finalizeSelection(selection) : { services: [], warnings: [] };
  await writeManifest(manifestPath, finalized.services);
  return finalized;
};
