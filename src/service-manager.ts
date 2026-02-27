import { LogBuffer } from "./log-buffer";
import { type ServiceEvent, ServiceProcess } from "./service";
import {
  ServiceGraphError,
  getDependencyClosure,
  getDependentsClosure,
  getTopologicalServiceOrder,
  validateServiceGraph,
} from "./service-graph";
import type { ServiceConfig, ServicePid, ServiceState } from "./types";

export interface ServiceView {
  name: string;
  state: ServiceState;
  lastExitCode: number | null;
  restartCount: number;
  restartInMs: number | null;
  log: LogBuffer;
  config: ServiceConfig;
}

export type UpdateCallback = () => void;

const LOG_CAPACITY = 2000;
const WAIT_INTERVAL_MS = 50;
const SERVICE_STOP_TIMEOUT_MS = 2000;
const RESTART_BASE_DELAY_MS = 250;
const RESTART_MAX_DELAY_MS = 5000;
const RUN_STABLE_RESET_MS = 5000;

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
  private readonly autoRestartSuppressed: Set<ServiceProcess> = new Set();
  private readonly restartTimers: Map<ServiceProcess, ReturnType<typeof setTimeout>> = new Map();
  private readonly restartAttempts: Map<ServiceProcess, number> = new Map();
  private readonly restartDeadlines: Map<ServiceProcess, number> = new Map();
  private readonly runStableTimers: Map<ServiceProcess, ReturnType<typeof setTimeout>> = new Map();
  private restartTicker: ReturnType<typeof setInterval> | null = null;
  private readonly updateCallbacks: Set<UpdateCallback> = new Set();
  private readonly processCallbacks: Set<UpdateCallback> = new Set();
  private selectedIndex = 0;

  constructor(configs: ServiceConfig[]) {
    this.assertValidConfigGraph(configs);
    this.services = configs.map((config) => new ServiceProcess(config));
    this.views = this.services.map((service) => ({
      name: service.config.name,
      state: "STOPPED",
      lastExitCode: null,
      restartCount: 0,
      restartInMs: null,
      log: new LogBuffer(LOG_CAPACITY),
      config: service.config,
    }));
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
    const max = Math.max(0, this.views.length - 1);
    const next = Math.min(Math.max(index, 0), max);
    if (next === this.selectedIndex) return;
    this.selectedIndex = next;
    this.notify();
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

  getSelectedConfig(): ServiceConfig | null {
    const view = this.views[this.selectedIndex];
    return view ? view.config : null;
  }

  getConfigs(): ServiceConfig[] {
    return this.views.map((v) => v.config);
  }

  getServicePids(): ServicePid[] {
    const entries: ServicePid[] = [];
    for (const service of this.services) {
      const pid = service.getPid();
      if (!pid) continue;
      entries.push({ name: service.config.name, pid });
    }
    return entries;
  }

  async startAll(): Promise<void> {
    await this.forEachResolvedService(this.getTopologicalOrderNames(), async (service) => {
      await this.startService(service);
    });
  }

  async stopAll(): Promise<void> {
    await this.forEachResolvedService(
      this.getTopologicalOrderNames().reverse(),
      async (service) => {
        await this.stopService(service);
      },
    );
  }

  async forceStopAll(): Promise<void> {
    await this.forEachResolvedService(
      this.getTopologicalOrderNames().reverse(),
      async (service) => {
        this.suppressAutoRestart(service);
        await service.forceStop();
      },
    );
  }

  async startSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;

    await this.forEachResolvedService(
      this.getStartOrderForService(service.config.name),
      async (next) => {
        await this.startService(next);
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
        this.suppressAutoRestart(next);
        await next.forceStop();
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
        await this.startService(next);
      },
    );

    if (view) {
      view.restartCount += 1;
      this.notify();
    }
  }

  async addService(config: ServiceConfig): Promise<void> {
    if (this.hasServiceName(config.name)) {
      throw new ServiceManagerError(`Service name already exists: ${config.name}`);
    }

    this.assertValidConfigGraph([...this.getConfigs(), config]);

    const process = new ServiceProcess(config);
    this.services.push(process);
    this.views.push({
      name: config.name,
      state: "STOPPED",
      lastExitCode: null,
      restartCount: 0,
      restartInMs: null,
      log: new LogBuffer(LOG_CAPACITY),
      config,
    });
    this.unsubscribers.push(this.subscribeService(process));

    await this.forEachResolvedService(this.getStartOrderForService(config.name), async (next) => {
      await this.startService(next);
    });

    this.notify();
  }

  async removeSelected(): Promise<boolean> {
    if (this.services.length === 0) return false;
    const index = this.selectedIndex;
    const service = this.services[index];
    if (!service) return false;

    await this.stopService(service);
    this.clearServiceRuntimeState(service);

    this.unsubscribers[index]?.();
    this.unsubscribers.splice(index, 1);
    this.services.splice(index, 1);
    this.views.splice(index, 1);

    if (this.selectedIndex >= this.views.length && this.views.length > 0) {
      this.selectedIndex = this.views.length - 1;
    }
    if (this.views.length === 0) {
      this.selectedIndex = 0;
    }

    this.notify();
    return true;
  }

  async updateServiceConfig(index: number, config: ServiceConfig): Promise<void> {
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

    const newProcess = new ServiceProcess(config);
    this.services[index] = newProcess;

    const view = this.views[index];
    if (view) {
      view.name = config.name;
      view.config = config;
      view.state = "STOPPED";
      view.lastExitCode = null;
      view.restartInMs = null;
      view.log.clear();
    }

    this.unsubscribers[index] = this.subscribeService(newProcess);

    await this.forEachResolvedService(this.getStartOrderForService(config.name), async (next) => {
      await this.startService(next);
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
        this.scheduleStableRunReset(service);
      }
      this.notifyProcessChange();
    } else if (event.type === "log") {
      view.log.add(event.entry);
    } else if (event.type === "exit") {
      this.clearRunStableTimer(service);
      view.lastExitCode = event.code;
      this.notifyProcessChange();
      this.maybeScheduleRestart(service, view, event.code);
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
      if (error instanceof ServiceGraphError) {
        throw new ServiceManagerError(error.message);
      }
      throw error;
    }
  }

  private assertValidConfigGraph(configs: ServiceConfig[]): void {
    this.runGraphOperation(() => {
      validateServiceGraph(configs);
    });
  }

  private getTopologicalOrderNames(): string[] {
    return this.runGraphOperation(() => getTopologicalServiceOrder(this.getConfigs()));
  }

  private getStartOrderForService(name: string): string[] {
    return this.runGraphOperation(() => {
      const closure = getDependencyClosure(this.getConfigs(), name);
      return this.getTopologicalOrderNames().filter((serviceName) => closure.has(serviceName));
    });
  }

  private getStopOrderForService(name: string): string[] {
    return this.runGraphOperation(() => {
      const closure = getDependentsClosure(this.getConfigs(), name);
      return this.getTopologicalOrderNames()
        .filter((serviceName) => closure.has(serviceName))
        .reverse();
    });
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

  private async startService(
    service: ServiceProcess,
    options: { resetAttempts: boolean } = { resetAttempts: true },
  ): Promise<void> {
    this.clearAutoRestartSuppression(service);
    this.clearRestartTimer(service);
    this.clearRestartDeadline(service);
    this.clearRunStableTimer(service);

    const view = this.getViewByService(service);
    if (view) {
      view.restartInMs = null;
    }

    if (options.resetAttempts) {
      this.restartAttempts.set(service, 0);
    }
    await service.start();
  }

  private hasServiceName(name: string, exceptIndex: number | null = null): boolean {
    return this.views.some((view, index) => index !== exceptIndex && view.name === name);
  }

  private suppressAutoRestart(service: ServiceProcess): void {
    this.autoRestartSuppressed.add(service);
    this.clearRestartTimer(service);
    this.clearRestartDeadline(service);
  }

  private clearAutoRestartSuppression(service: ServiceProcess): void {
    this.autoRestartSuppressed.delete(service);
  }

  private clearRestartTimer(service: ServiceProcess): void {
    const timer = this.restartTimers.get(service);
    if (timer) {
      clearTimeout(timer);
      this.restartTimers.delete(service);
    }
  }

  private clearRestartDeadline(service: ServiceProcess): void {
    this.restartDeadlines.delete(service);

    const view = this.getViewByService(service);
    if (view) {
      view.restartInMs = null;
    }

    if (this.restartDeadlines.size === 0) {
      this.stopRestartTicker();
    }
  }

  private scheduleStableRunReset(service: ServiceProcess): void {
    this.clearRunStableTimer(service);

    const timer = setTimeout(() => {
      this.runStableTimers.delete(service);
      if (!this.services.includes(service) || !service.isRunning()) return;
      this.restartAttempts.set(service, 0);
    }, RUN_STABLE_RESET_MS);

    this.runStableTimers.set(service, timer);
  }

  private clearRunStableTimer(service: ServiceProcess): void {
    const timer = this.runStableTimers.get(service);
    if (!timer) return;
    clearTimeout(timer);
    this.runStableTimers.delete(service);
  }

  private clearServiceRuntimeState(service: ServiceProcess): void {
    this.clearAutoRestartSuppression(service);
    this.clearRestartTimer(service);
    this.clearRestartDeadline(service);
    this.clearRunStableTimer(service);
    this.restartAttempts.delete(service);
  }

  private maybeScheduleRestart(
    service: ServiceProcess,
    view: ServiceView,
    exitCode: number | null,
  ): void {
    if (!this.services.includes(service)) return;

    if (this.autoRestartSuppressed.has(service)) {
      this.autoRestartSuppressed.delete(service);
      this.restartAttempts.set(service, 0);
      return;
    }

    const policy = view.config.restart_policy ?? "never";
    if (policy === "never") return;
    if (policy === "on-failure" && exitCode === 0) return;

    const attempt = (this.restartAttempts.get(service) ?? 0) + 1;
    this.restartAttempts.set(service, attempt);

    const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** (attempt - 1), RESTART_MAX_DELAY_MS);
    this.clearRestartTimer(service);
    this.restartDeadlines.set(service, Date.now() + delay);
    view.restartInMs = delay;
    this.startRestartTicker();

    const timer = setTimeout(() => {
      this.restartTimers.delete(service);
      if (!this.services.includes(service)) return;

      const index = this.services.indexOf(service);
      const currentView = index >= 0 ? this.views[index] : null;
      if (currentView) {
        currentView.restartCount += 1;
      }

      void this.startService(service, { resetAttempts: false }).then(() => {
        this.notify();
      });
    }, delay);

    this.restartTimers.set(service, timer);
  }

  private startRestartTicker(): void {
    if (this.restartTicker) return;

    this.restartTicker = setInterval(() => {
      let changed = false;
      const now = Date.now();

      for (const [service, deadline] of this.restartDeadlines.entries()) {
        const remaining = Math.max(0, deadline - now);

        if (!this.services.includes(service)) {
          this.restartDeadlines.delete(service);
          changed = true;
          continue;
        }

        const view = this.getViewByService(service);
        if (!view) {
          this.restartDeadlines.delete(service);
          changed = true;
          continue;
        }

        if (view.restartInMs !== remaining) {
          view.restartInMs = remaining;
          changed = true;
        }
      }

      if (this.restartDeadlines.size === 0) {
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
    this.suppressAutoRestart(service);
    this.clearRunStableTimer(service);
    if (!service.isRunning()) return;

    await service.stop();
    const stopped = await this.waitForServiceExit(service, SERVICE_STOP_TIMEOUT_MS);
    if (stopped) return;

    await service.forceStop();
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
}
