import { LogBuffer } from "./log-buffer";
import { ServiceProcess, type ServiceEvent } from "./service";
import type { LogEntry, ServiceConfig, ServiceState } from "./types";

export interface ServiceView {
  name: string;
  state: ServiceState;
  lastExitCode: number | null;
  restartCount: number;
  log: LogBuffer;
}

export type UpdateCallback = () => void;

const LOG_CAPACITY = 2000;

export class ServiceManager {
  private readonly services: ServiceProcess[];
  private readonly views: ServiceView[];
  private readonly updateCallbacks: Set<UpdateCallback> = new Set();
  private selectedIndex = 0;

  constructor(configs: ServiceConfig[]) {
    this.services = configs.map((config) => new ServiceProcess(config));
    this.views = this.services.map((service) => ({
      name: service.config.name,
      state: "STOPPED",
      lastExitCode: null,
      restartCount: 0,
      log: new LogBuffer(LOG_CAPACITY),
    }));

    this.services.forEach((service, index) => {
      service.subscribe((event) => this.handleEvent(index, event));
    });
  }

  onUpdate(callback: UpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
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
    } else if (event.type === "log") {
      view.log.add(event.entry);
    } else if (event.type === "exit") {
      view.lastExitCode = event.code;
    }
    this.notify();
  }

  private notify() {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }
}
