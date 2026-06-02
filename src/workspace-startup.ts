import { createDockerComposeExternalRuntimeAdapter } from "./docker";
import {
  ExternalRuntimeVisibilityManager,
  detectExternalRuntimes,
  type ExternalRuntimeAdapter,
} from "./external-runtime";
import { loadManifest } from "./manifest";
import { ProcessOutputStore } from "./process-output-store";
import { ProcessClaimStore } from "./process-claim";
import { ServiceManager } from "./service-manager";
import { createShutdownHandler } from "./shutdown";
import type { AppConfig, Manifest } from "./types";

export interface WorkspaceRuntimeState {
  closing: boolean;
  disposed: boolean;
}

export type ShutdownController = ReturnType<typeof createShutdownHandler>;

export interface WorkspaceStartupMountContext {
  manifest: Manifest;
  manifestPath: string;
  appConfig: AppConfig | undefined;
  manager: ServiceManager;
  processClaimStore: ProcessClaimStore;
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null;
  shutdown: ShutdownController;
}

export interface WorkspaceStartupOptions {
  cwd: string;
  manifestPath: string;
  runtime: WorkspaceRuntimeState;
  logger?: (message: string) => void;
  externalRuntimeVisibilityEnabled?: (appConfig: AppConfig | undefined) => boolean;
  externalRuntimeAdapters?: ExternalRuntimeAdapter[];
  onShutdownReady?: (shutdown: ShutdownController) => void;
  mountWorkspace: (context: WorkspaceStartupMountContext) => void;
}

export interface WorkspaceStartupSession extends WorkspaceStartupMountContext {
  startup: Promise<void>;
}

export const isExternalRuntimeVisibilityEnabled = (appConfig: AppConfig | undefined): boolean =>
  appConfig?.docker?.enabled ?? true;

export const startWorkspace = async (
  options: WorkspaceStartupOptions,
): Promise<WorkspaceStartupSession> => {
  const manifest = await loadManifest(options.manifestPath);
  const appConfig = manifest.app;
  const logger = options.logger;
  const processClaimStore = new ProcessClaimStore(options.cwd, { logger });
  const processOutputStore = new ProcessOutputStore(options.cwd);
  const externalRuntimeAdapters = options.externalRuntimeAdapters ?? [
    createDockerComposeExternalRuntimeAdapter(),
  ];
  const externalRuntimes = (
    options.externalRuntimeVisibilityEnabled ?? isExternalRuntimeVisibilityEnabled
  )(appConfig)
    ? await detectExternalRuntimes(options.cwd, externalRuntimeAdapters)
    : [];
  const externalRuntimeManager =
    externalRuntimes.length > 0 ? new ExternalRuntimeVisibilityManager(externalRuntimes) : null;
  const manager = new ServiceManager(manifest.services, {
    processClaimStore,
    processOutputStore,
    externalRuntimeManager,
  });
  const shutdown = createShutdownHandler({
    cwd: options.cwd,
    manager,
    externalRuntimeManager,
    getServicePids: () => manager.getServicePids(),
    logger,
  });

  shutdown.install();
  options.onShutdownReady?.(shutdown);

  const context: WorkspaceStartupMountContext = {
    manifest,
    manifestPath: options.manifestPath,
    appConfig,
    manager,
    processClaimStore,
    externalRuntimeManager,
    shutdown,
  };

  options.mountWorkspace(context);
  externalRuntimeManager?.startPolling();

  const startup = runStartup(context, options.runtime, logger);
  return { ...context, startup };
};

const runStartup = async (
  context: WorkspaceStartupMountContext,
  runtime: WorkspaceRuntimeState,
  logger?: (message: string) => void,
): Promise<void> => {
  try {
    await context.processClaimStore.cleanupStaleDirectManagedProcessClaims(
      context.manifest.services.map((service) => service.name),
    );
    if (runtime.closing || runtime.disposed) return;

    await context.manager.startAll({
      shouldCancel: () => runtime.closing || runtime.disposed,
    });
  } catch (error) {
    logger?.(error instanceof Error ? error.message : String(error ?? ""));
  }
};
