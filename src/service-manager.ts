import { DirectManagedProcessCollectionLifecycle } from "./direct-managed-process-collection";
import {
  DirectManagedProcessLifecycle,
  DirectManagedProcessLifecycleCollection,
} from "./direct-managed-process-lifecycle";
import { ExternalRuntimeVisibilityManager } from "./external-runtime";
import { LogBuffer } from "./log-buffer";
import { LaunchInstructionExecutionAdapter } from "./launch-execution";
import { ProcessOutputStore } from "./process-output-store";
import { ProcessClaimStore } from "./process-claim";
import { getDirectManagedRuntimeStatus } from "./runtime-status";
import { type ServiceEvent, ServiceProcess } from "./service";
import { ServiceGraphError } from "./service-graph";
import { StartupDependencyPlanError, planStartupDependencies } from "./startup-dependency-plan";
import type { ProcessDefinition, RuntimeStatus, ServicePid, ServiceState } from "./types";

export interface ServiceView {
  name: string;
  state: ServiceState;
  runtimeStatus: RuntimeStatus;
  lastExitCode: number | null;
  restartCount: number;
  manualRestartCount: number;
  restartInMs: number | null;
  log: LogBuffer;
  config: ProcessDefinition;
}

export type UpdateCallback = () => void;

export interface ServiceManagerOptions {
  launchAdapter?: LaunchInstructionExecutionAdapter;
  processClaimStore?: ProcessClaimStore | null;
  processOutputStore?: ProcessOutputStore | null;
  externalRuntimeManager?: ExternalRuntimeVisibilityManager | null;
}

const LOG_CAPACITY = 2000;
const WAIT_INTERVAL_MS = 50;
const SERVICE_STOP_TIMEOUT_MS = 2000;
export class ServiceManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceManagerError";
  }
}

export class ServiceManager {
  private services: ServiceProcess[];
  private views: ServiceView[];
  private unsubscribers: Array<() => void>;
  private readonly lifecycles = new DirectManagedProcessLifecycleCollection<ServiceProcess>();
  private readonly collectionLifecycle: DirectManagedProcessCollectionLifecycle;
  private readonly launchAdapter: LaunchInstructionExecutionAdapter;
  private readonly processClaimStore: ProcessClaimStore | null;
  private readonly processOutputStore: ProcessOutputStore | null;
  private readonly externalRuntimeManager: ExternalRuntimeVisibilityManager | null;
  private restartTicker: ReturnType<typeof setInterval> | null = null;
  private readonly updateCallbacks: Set<UpdateCallback> = new Set();
  private readonly processCallbacks: Set<UpdateCallback> = new Set();
  private selectedIndex = 0;

  constructor(configs: ProcessDefinition[], options: ServiceManagerOptions = {}) {
    this.launchAdapter = options.launchAdapter ?? new LaunchInstructionExecutionAdapter();
    this.processClaimStore = options.processClaimStore ?? null;
    this.processOutputStore = options.processOutputStore ?? null;
    this.externalRuntimeManager = options.externalRuntimeManager ?? null;
    this.collectionLifecycle = new DirectManagedProcessCollectionLifecycle(
      () => this.getConfigs(),
      {
        allowExternalDependencies: this.externalRuntimeManager !== null,
      },
    );
    this.assertValidConfigGraph(configs);
    this.services = configs.map(
      (config) => new ServiceProcess(config, this.launchAdapter, this.processClaimStore),
    );
    this.selectedIndex = configs.length === 0 ? -1 : 0;
    this.views = this.services.map((service) => ({
      name: service.config.name,
      state: "STOPPED",
      runtimeStatus: "off",
      lastExitCode: null,
      restartCount: 0,
      manualRestartCount: 0,
      restartInMs: null,
      log: new LogBuffer(LOG_CAPACITY),
      config: service.config,
    }));
    for (const service of this.services) {
      this.lifecycles.set(service, this.createLifecycle(service));
    }
    this.unsubscribers = this.services.map((service) => this.subscribeService(service));
  }

  onUpdate(callback: UpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  onProcessChange(callback: UpdateCallback): () => void {
    this.processCallbacks.add(callback);
    return () => this.processCallbacks.delete(callback);
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    const max = this.views.length - 1;
    const next = this.views.length === 0 ? -1 : Math.min(Math.max(index, -1), max);
    if (next === this.selectedIndex) return;
    this.selectedIndex = next;
    this.notify();
  }

  deselect(): void {
    this.setSelectedIndex(-1);
  }

  moveSelection(delta: number): void {
    this.setSelectedIndex(this.selectedIndex + delta);
  }

  getViews(): ServiceView[] {
    return [...this.views];
  }

  getSelectedView(): ServiceView | null {
    return this.views[this.selectedIndex] ?? null;
  }

  getSelectedConfig(): ProcessDefinition | null {
    const view = this.views[this.selectedIndex];
    return view ? view.config : null;
  }

  getConfigs(): ProcessDefinition[] {
    return this.views.map((v) => v.config);
  }

  getServicePids(): ServicePid[] {
    const entries: ServicePid[] = [];
    for (const service of this.services) {
      const entry = service.getPidInfo();
      if (!entry) continue;
      entries.push(entry);
    }
    return entries;
  }

  async startAll(options: { shouldCancel?: () => boolean } = {}): Promise<void> {
    const layers = this.getStartupLayers();

    for (const layer of layers) {
      if (options.shouldCancel?.()) return;

      await Promise.all(
        layer.map(async (name) => {
          const service = this.getServiceByName(name);
          if (!service) return;
          await this.startServiceUnlessBlocked(service);
        }),
      );
    }
  }

  async stopAll(): Promise<void> {
    await this.forEachResolvedService(this.getShutdownOrderNames(), async (service) => {
      await this.stopService(service);
    });
  }

  async forceStopAll(): Promise<void> {
    await this.forEachResolvedService(this.getShutdownOrderNames(), async (service) => {
      const view = this.getViewByService(service);
      if (view) this.getLifecycle(service)?.suppressRestart(view);
      await service.forceStop("SIGKILL");
    });
  }

  async startSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;

    await this.forEachResolvedService(
      this.getStartOrderForService(service.config.name),
      async (next) => {
        await this.startServiceUnlessBlocked(next);
      },
    );
  }

  async stopSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;

    await this.forEachResolvedService(
      this.getStopOrderForService(service.config.name),
      async (next) => {
        await this.stopService(next);
      },
    );
  }

  async killSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;

    await this.forEachResolvedService(
      this.getStopOrderForService(service.config.name),
      async (next) => {
        const view = this.getViewByService(next);
        if (view) this.getLifecycle(next)?.suppressRestart(view);
        await next.forceStop("SIGKILL");
      },
    );
  }

  async restartSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;
    const view = this.views[this.selectedIndex];
    await this.stopService(service);

    await this.forEachResolvedService(
      this.getStartOrderForService(service.config.name),
      async (next) => {
        await this.startServiceUnlessBlocked(next);
      },
    );

    if (view) {
      view.manualRestartCount += 1;
      this.notify();
    }
  }

  async addService(config: ProcessDefinition): Promise<void> {
    if (this.hasServiceName(config.name)) {
      throw new ServiceManagerError(`Service name already exists: ${config.name}`);
    }

    const wasEmpty = this.views.length === 0;
    this.assertValidConfigGraph([...this.getConfigs(), config]);

    const process = new ServiceProcess(config, this.launchAdapter, this.processClaimStore);
    this.services.push(process);
    this.views.push({
      name: config.name,
      state: "STOPPED",
      runtimeStatus: "off",
      lastExitCode: null,
      restartCount: 0,
      manualRestartCount: 0,
      restartInMs: null,
      log: new LogBuffer(LOG_CAPACITY),
      config,
    });
    this.lifecycles.set(process, this.createLifecycle(process));
    this.unsubscribers.push(this.subscribeService(process));
    if (wasEmpty) this.selectedIndex = 0;

    await this.forEachResolvedService(this.getStartOrderForService(config.name), async (next) => {
      await this.startServiceUnlessBlocked(next);
    });

    this.notify();
  }

  async removeSelected(): Promise<boolean> {
    if (this.services.length === 0 || this.selectedIndex === -1) return false;
    const index = this.selectedIndex;
    const service = this.services[index];
    if (!service) return false;

    await this.stopService(service);
    this.clearServiceRuntimeState(service);

    this.unsubscribers[index]?.();
    this.unsubscribers.splice(index, 1);
    this.lifecycles.delete(service);
    this.services.splice(index, 1);
    this.views.splice(index, 1);

    if (this.views.length === 0) {
      this.selectedIndex = -1;
    } else if (this.selectedIndex >= this.views.length) {
      this.selectedIndex = this.views.length - 1;
    }

    this.notify();
    return true;
  }

  async updateProcessDefinition(index: number, config: ProcessDefinition): Promise<void> {
    const oldService = this.services[index];
    if (!oldService) return;

    if (this.hasServiceName(config.name, index)) {
      throw new ServiceManagerError(`Service name already exists: ${config.name}`);
    }

    const nextConfigs = this.getConfigs().map((entry, i) => (i === index ? config : entry));
    this.assertValidConfigGraph(nextConfigs);

    await this.stopService(oldService);
    this.clearServiceRuntimeState(oldService);
    this.unsubscribers[index]?.();

    const newProcess = new ServiceProcess(config, this.launchAdapter, this.processClaimStore);
    this.services[index] = newProcess;

    const view = this.views[index];
    if (view) {
      view.name = config.name;
      view.config = config;
      view.state = "STOPPED";
      view.runtimeStatus = "off";
      view.lastExitCode = null;
      view.restartInMs = null;
      view.log.clear();
    }

    this.unsubscribers[index] = this.subscribeService(newProcess);
    this.lifecycles.delete(oldService);
    this.lifecycles.set(newProcess, this.createLifecycle(newProcess));

    await this.forEachResolvedService(this.getStartOrderForService(config.name), async (next) => {
      await this.startServiceUnlessBlocked(next);
    });

    this.notify();
  }

  async waitForExit(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const anyRunning = this.services.some((service) => service.isRunning());
      if (!anyRunning) return true;
      await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    }
    return false;
  }

  private handleEvent(service: ServiceProcess, index: number, event: ServiceEvent) {
    const view = this.views[index];
    if (!view) return;

    if (event.type === "state") {
      view.state = event.state;
      if (event.state === "RUNNING") {
        view.restartInMs = null;
        this.getLifecycle(service)?.noteRunning();
      }
      this.updateRuntimeStatus(view);
      this.notifyProcessChange();
    } else if (event.type === "log") {
      view.log.add(event.entry);
      void this.processOutputStore?.append(view.name, event.entry);
    } else if (event.type === "exit") {
      const lifecycle = this.getLifecycle(service);
      lifecycle?.noteExit(view, event.code);
      if (lifecycle?.hasPendingRestart()) this.startRestartTicker();
      view.lastExitCode = event.code;
      this.updateRuntimeStatus(view);
      this.notifyProcessChange();
    }

    this.notify();
  }

  private notify() {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }

  private notifyProcessChange() {
    for (const callback of this.processCallbacks) {
      callback();
    }
  }

  private subscribeService(service: ServiceProcess): () => void {
    return service.subscribe((event) => {
      const index = this.services.indexOf(service);
      if (index === -1) return;
      this.handleEvent(service, index, event);
    });
  }

  private async forEachResolvedService(
    names: string[],
    action: (service: ServiceProcess) => Promise<void>,
  ): Promise<void> {
    for (const name of names) {
      const service = this.getServiceByName(name);
      if (!service) continue;
      await action(service);
    }
  }

  private runGraphOperation<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof ServiceGraphError || error instanceof StartupDependencyPlanError) {
        throw new ServiceManagerError(error.message);
      }
      throw error;
    }
  }

  private assertValidConfigGraph(configs: ProcessDefinition[]): void {
    this.runGraphOperation(() => {
      this.collectionLifecycle.validate(configs);
    });
  }

  private getShutdownOrderNames(): string[] {
    return this.runGraphOperation(() => this.collectionLifecycle.shutdownOrder());
  }

  private getStartupLayers(): string[][] {
    return this.runGraphOperation(() => this.collectionLifecycle.startupLayers());
  }

  private getStartOrderForService(name: string): string[] {
    return this.runGraphOperation(() => this.collectionLifecycle.startOrderFor(name));
  }

  private getStopOrderForService(name: string): string[] {
    return this.runGraphOperation(() => this.collectionLifecycle.stopOrderFor(name));
  }

  private getServiceByName(name: string): ServiceProcess | null {
    const index = this.views.findIndex((view) => view.name === name);
    if (index === -1) return null;
    return this.services[index] ?? null;
  }

  private getViewByService(service: ServiceProcess): ServiceView | null {
    const index = this.services.indexOf(service);
    if (index === -1) return null;
    return this.views[index] ?? null;
  }

  private updateRuntimeStatus(view: ServiceView): void {
    view.runtimeStatus = getDirectManagedRuntimeStatus(view.state, view.restartInMs);
  }

  private async startService(
    service: ServiceProcess,
    options: { resetAttempts: boolean } = { resetAttempts: true },
  ): Promise<void> {
    const view = this.getViewByService(service);
    if (view) {
      view.restartInMs = null;
      this.updateRuntimeStatus(view);
    }

    const lifecycle = this.getLifecycle(service);
    if (lifecycle && view) {
      if (options.resetAttempts) {
        lifecycle.prepareManualStart(view);
      } else {
        lifecycle.prepareAutomaticRestart(view);
      }
    }
    await service.start();
  }

  private async startServiceUnlessBlocked(service: ServiceProcess): Promise<void> {
    const blockedBy = await this.getUnavailableDependencies(service.config);
    const blockedState = this.getPlannedBlockedState(service.config.name, blockedBy);
    if (blockedState) {
      service.block(
        `Startup blocked by failed Startup Dependency ${blockedState.blockedBy
          .map((name) => `"${name}"`)
          .join(", ")}.`,
      );
      return;
    }

    await this.startService(service);
  }

  private getPlannedBlockedState(name: string, blockedBy: string[]) {
    if (blockedBy.length === 0) return null;
    return this.runGraphOperation(() =>
      planStartupDependencies(this.getConfigs(), {
        allowExternalDependencies: this.externalRuntimeManager !== null,
      })
        .blockedStatesFor(blockedBy)
        .find((state) => state.name === name),
    );
  }

  private async getUnavailableDependencies(config: ProcessDefinition): Promise<string[]> {
    const blocked: string[] = [];
    for (const dependency of config.startupDependencies) {
      const view = this.views.find((entry) => entry.name === dependency);
      if (view) {
        if (view.state === "FAILED" || view.state === "BLOCKED") blocked.push(dependency);
        continue;
      }

      const available = await this.externalRuntimeManager?.ensureProcessAvailable(dependency);
      if (!available) blocked.push(dependency);
    }
    return blocked;
  }

  private hasServiceName(name: string, exceptIndex: number | null = null): boolean {
    return this.views.some((view, index) => index !== exceptIndex && view.name === name);
  }

  private clearServiceRuntimeState(service: ServiceProcess): void {
    const view = this.getViewByService(service);
    if (view) {
      this.getLifecycle(service)?.clearRuntimeState(view);
      this.updateRuntimeStatus(view);
    }
  }

  private startRestartTicker(): void {
    if (this.restartTicker) return;

    this.restartTicker = setInterval(() => {
      const now = Date.now();
      const changed = this.lifecycles.tick((service) => this.getViewByService(service), now);
      if (changed) {
        for (const view of this.views) this.updateRuntimeStatus(view);
      }

      if (!this.lifecycles.hasPendingRestart()) {
        this.stopRestartTicker();
      }

      if (changed) {
        this.notify();
      }
    }, 100);
  }

  private stopRestartTicker(): void {
    if (!this.restartTicker) return;
    clearInterval(this.restartTicker);
    this.restartTicker = null;
  }

  private async stopService(service: ServiceProcess): Promise<void> {
    const view = this.getViewByService(service);
    if (view) {
      this.getLifecycle(service)?.suppressRestart(view);
      this.updateRuntimeStatus(view);
    }
    if (!service.isRunning()) return;

    await service.stop();
    const stopped = await this.waitForServiceExit(service, SERVICE_STOP_TIMEOUT_MS);
    if (stopped) return;

    await service.forceStop("SIGTERM");
    const terminated = await this.waitForServiceExit(service, SERVICE_STOP_TIMEOUT_MS);
    if (terminated) return;

    await service.forceStop("SIGKILL");
    await this.waitForServiceExit(service, SERVICE_STOP_TIMEOUT_MS);
  }

  private async waitForServiceExit(service: ServiceProcess, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!service.isRunning()) return true;
      await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    }
    return !service.isRunning();
  }

  private createLifecycle(service: ServiceProcess): DirectManagedProcessLifecycle {
    return new DirectManagedProcessLifecycle({
      onChange: () => this.notify(),
      onRestart: async (resetAttempts) => {
        await this.startService(service, { resetAttempts });
      },
      isActive: () => this.services.includes(service),
      isRunning: () => service.isRunning(),
    });
  }

  private getLifecycle(service: ServiceProcess): DirectManagedProcessLifecycle | null {
    return this.lifecycles.get(service) ?? null;
  }
}
