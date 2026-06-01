import { dirname } from "node:path";
import { finalizeSelection, type DiscoverySelection } from "./discovery";
import { DirectManagedProcessCollectionLifecycle } from "./direct-managed-process-collection";
import { parseServiceBlock, saveManifest } from "./manifest";
import { normalizeProcessDefinition, type ProcessDefinitionInput } from "./process-definition";
import type { ProcessClaimStore } from "./process-claim";
import { getTopologicalServiceOrder } from "./service-graph";
import type { ServiceManager } from "./service-manager";
import { getErrorMessage } from "./shared";
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

interface ManifestEditTransaction {
  nextConfigs: ServiceConfig[];
  apply: () => Promise<void>;
  releaseClaimNames?: string[];
}

export const addProcessDefinition = async (
  context: ManifestEditingContext,
  input: ProcessDefinitionInput,
): Promise<ManifestEditingResult> => {
  const config = normalizeProcessDefinition(input, { baseDir: dirname(context.manifestPath) });
  return applyManifestEdit(context, {
    nextConfigs: [...context.manager.getConfigs(), config],
    apply: async () => {
      await context.manager.addService(config);
    },
  });
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

  return applyManifestEdit(context, {
    nextConfigs,
    apply: async () => {
      await context.manager.updateServiceConfig(index, config);
    },
    releaseClaimNames: previousName && previousName !== config.name ? [previousName] : [],
  });
};

export const removeSelectedProcessDefinition = async (
  context: ManifestEditingContext,
): Promise<ManifestEditingResult> => {
  const removedName = context.manager.getSelectedConfig()?.name;
  const nextConfigs = context.manager
    .getConfigs()
    .filter((_, index) => index !== context.manager.getSelectedIndex());

  return applyManifestEdit(context, {
    nextConfigs,
    apply: async () => {
      await context.manager.removeSelected();
    },
    releaseClaimNames: removedName ? [removedName] : [],
  });
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

  const result = await applyManifestEdit(context, {
    nextConfigs,
    apply: async () => {
      for (const serviceName of orderedNames) {
        const service = pendingByName.get(serviceName);
        if (!service) continue;
        await context.manager.addService(service);
      }
    },
  });
  return { ...result, warnings: finalized.warnings };
};

const applyManifestEdit = async (
  context: ManifestEditingContext,
  transaction: ManifestEditTransaction,
): Promise<ManifestEditingResult> => {
  validateNextCollection(transaction.nextConfigs);
  await saveManifest(context.manifestPath, transaction.nextConfigs, context.appConfig);
  await transaction.apply();

  const warnings: string[] = [];

  if (transaction.releaseClaimNames && transaction.releaseClaimNames.length > 0) {
    try {
      await context.processClaimStore.releaseDirectManagedProcessNames(
        transaction.releaseClaimNames,
      );
    } catch (error) {
      warnings.push(`Failed to release Process Claims: ${getErrorMessage(error)}`);
    }
  }

  return { services: context.manager.getConfigs(), warnings };
};

const validateNextCollection = (services: ServiceConfig[]): void => {
  new DirectManagedProcessCollectionLifecycle(() => services).validate(services);
};
