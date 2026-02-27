import { LogBuffer } from "./log-buffer";
import { type ServiceEvent, ServiceProcess } from "./service";
import type { ServiceConfig, ServicePid, ServiceState } from "./types";

export interface ServiceView {
  name: string;
  state: ServiceState;
  lastExitCode: number | null;
  restartCount: number;
  log: LogBuffer;
  config: ServiceConfig;
}

export type UpdateCallback = () => void;

const LOG_CAPACITY = 2000;

export class ServiceManager {
  private services: ServiceProcess[];
  private views: ServiceView[];
  private readonly updateCallbacks: Set<UpdateCallback> = new Set();
  private readonly processCallbacks: Set<UpdateCallback> = new Set();
  private selectedIndex = 0;

  constructor(configs: ServiceConfig[]) {
    this.services = configs.map((config) => new ServiceProcess(config));
    this.views = this.services.map((service) => ({
      name: service.config.name,
      state: "STOPPED",
      lastExitCode: null,
      restartCount: 0,
      log: new LogBuffer(LOG_CAPACITY),
      config: service.config,
    }));

    this.services.forEach((service, index) => {
      service.subscribe((event) => this.handleEvent(index, event));
    });
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
    await Promise.all(this.services.map((service) => service.start()));
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.services.map((service) => service.stop()));
  }

  async forceStopAll(): Promise<void> {
    await Promise.all(this.services.map((service) => service.forceStop()));
  }

  async startSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;
    await service.start();
  }

  async stopSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;
    await service.stop();
  }

  async killSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;
    await service.forceStop();
  }

  async restartSelected(): Promise<void> {
    const service = this.services[this.selectedIndex];
    if (!service) return;
    const view = this.views[this.selectedIndex];
    await service.stop();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await service.start();
    if (view) {
      view.restartCount += 1;
      this.notify();
    }
  }

  async addService(config: ServiceConfig): Promise<void> {
    const process = new ServiceProcess(config);
    const index = this.services.length;
    this.services.push(process);
    this.views.push({
      name: config.name,
      state: "STOPPED",
      lastExitCode: null,
      restartCount: 0,
      log: new LogBuffer(LOG_CAPACITY),
      config,
    });
    process.subscribe((event) => this.handleEvent(index, event));
    await process.start();
    this.notify();
  }

  async removeSelected(): Promise<boolean> {
    if (this.services.length === 0) return false;
    const index = this.selectedIndex;
    const service = this.services[index];
    if (!service) return false;

    if (service.isRunning()) {
      await service.stop();
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (service.isRunning()) {
        await service.forceStop();
      }
    }

    this.services.splice(index, 1);
    this.views.splice(index, 1);

    if (this.selectedIndex >= this.views.length && this.views.length > 0) {
      this.selectedIndex = this.views.length - 1;
    }
    if (this.views.length === 0) {
      this.selectedIndex = 0;
    }

    // Re-wire event subscriptions with correct indices
    this.services.forEach((svc, i) => {
      svc.clearSubscriptions();
      svc.subscribe((event) => this.handleEvent(i, event));
    });

    this.notify();
    return true;
  }

  async updateServiceConfig(index: number, config: ServiceConfig): Promise<void> {
    const oldService = this.services[index];
    if (!oldService) return;

    if (oldService.isRunning()) {
      await oldService.stop();
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (oldService.isRunning()) {
        await oldService.forceStop();
      }
    }

    const newProcess = new ServiceProcess(config);
    this.services[index] = newProcess;

    const view = this.views[index];
    if (view) {
      view.name = config.name;
      view.config = config;
      view.state = "STOPPED";
      view.lastExitCode = null;
      view.log.clear();
    }

    newProcess.subscribe((event) => this.handleEvent(index, event));
    await newProcess.start();
    this.notify();
  }

  async waitForExit(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const anyRunning = this.services.some((service) => service.isRunning());
      if (!anyRunning) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }

  private handleEvent(index: number, event: ServiceEvent) {
    const view = this.views[index];
    if (!view) return;
    if (event.type === "state") {
      view.state = event.state;
      this.notifyProcessChange();
    } else if (event.type === "log") {
      view.log.add(event.entry);
    } else if (event.type === "exit") {
      view.lastExitCode = event.code;
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
}
