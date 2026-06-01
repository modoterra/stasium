import { dirname } from "node:path";
import { finalizeSelection, type DiscoverySelection } from "./discovery";
import { DirectManagedProcessCollectionLifecycle } from "./direct-managed-process-collection";
import { parseServiceBlock, saveManifest } from "./manifest";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import type { ProcessClaimStore } from "./process-claim";
import { getTopologicalServiceOrder } from "./service-graph";
import type { ServiceManager } from "./service-manager";
import type { AppConfig, ServiceConfig } from "./types";

export interface ManifestEditingContext {
  manifestPath: string;
  appConfig?: AppConfig;
  manager: ServiceManager;
  processClaimStore: ProcessClaimStore;
}

export interface ManifestEditingResult {
  services: ServiceConfig[];
  warnings: string[];
}

export const addProcessDefinition = async (
  context: ManifestEditingContext,
  input: ProcessDefinitionInput,
): Promise<ManifestEditingResult> => {
  const config = normalizeProcessDefinition(input, { baseDir: dirname(context.manifestPath) });
  validateNextCollection([...context.manager.getConfigs(), config]);
  await context.manager.addService(config);
  await persist(context);
  return { services: context.manager.getConfigs(), warnings: [] };
};

export const replaceProcessDefinition = async (
  context: ManifestEditingContext,
  index: number,
  serviceBlockToml: string,
): Promise<ManifestEditingResult> => {
  const config = parseServiceBlock(serviceBlockToml, dirname(context.manifestPath));
  const previousName = context.manager.getConfigs()[index]?.name;
  const nextConfigs = context.manager
    .getConfigs()
    .map((entry, entryIndex) => (entryIndex === index ? config : entry));

  validateNextCollection(nextConfigs);
  await context.manager.updateServiceConfig(index, config);
  await persist(context);

  if (previousName && previousName !== config.name) {
    await context.processClaimStore.releaseDirectManagedProcessNames([previousName]);
  }

  return { services: context.manager.getConfigs(), warnings: [] };
};

export const removeSelectedProcessDefinition = async (
  context: ManifestEditingContext,
): Promise<ManifestEditingResult> => {
  const removedName = context.manager.getSelectedConfig()?.name;
  const nextConfigs = context.manager
    .getConfigs()
    .filter((_, index) => index !== context.manager.getSelectedIndex());

  validateNextCollection(nextConfigs);
  await context.manager.removeSelected();
  await persist(context);

  if (removedName) await context.processClaimStore.releaseDirectManagedProcessNames([removedName]);

  return { services: context.manager.getConfigs(), warnings: [] };
};

export const addSelectedDiscoveryCandidates = async (
  context: ManifestEditingContext,
  selection: DiscoverySelection,
): Promise<ManifestEditingResult> => {
  const finalized = finalizeSelection(selection, {
    existingServices: context.manager.getConfigs(),
    usedNames: context.manager.getConfigs().map((config) => config.name),
  });

  if (finalized.services.length === 0) {
    return { services: context.manager.getConfigs(), warnings: finalized.warnings };
  }

  const nextConfigs = [...context.manager.getConfigs(), ...finalized.services];
  validateNextCollection(nextConfigs);

  const pendingByName = new Map(finalized.services.map((service) => [service.name, service]));
  const orderedNames = getTopologicalServiceOrder(nextConfigs);

  for (const serviceName of orderedNames) {
    const service = pendingByName.get(serviceName);
    if (!service) continue;
    await context.manager.addService(service);
  }

  await persist(context);
  return { services: context.manager.getConfigs(), warnings: finalized.warnings };
};

const validateNextCollection = (services: ServiceConfig[]): void => {
  new DirectManagedProcessCollectionLifecycle(() => services).validate(services);
};

const persist = async (context: ManifestEditingContext): Promise<void> => {
  await saveManifest(context.manifestPath, context.manager.getConfigs(), context.appConfig);
};
