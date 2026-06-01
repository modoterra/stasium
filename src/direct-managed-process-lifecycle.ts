import type { ServiceConfig } from "./types";

export interface RestartRuleLifecycleView {
  config: ServiceConfig;
  restartCount: number;
  restartInMs: number | null;
}

interface RestartRuleLifecycleOptions {
  onChange: () => void;
  onRestart: (resetAttempts: boolean) => Promise<void>;
  isActive: () => boolean;
  isRunning: () => boolean;
}

const RESTART_BASE_DELAY_MS = 250;
const RESTART_MAX_DELAY_MS = 5000;
const RUN_STABLE_RESET_MS = 5000;

export class DirectManagedProcessLifecycle {
  private readonly onChange: () => void;
  private readonly onRestart: (resetAttempts: boolean) => Promise<void>;
  private readonly isActive: () => boolean;
  private readonly isRunning: () => boolean;
  private autoRestartSuppressed = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private restartDeadline: number | null = null;
  private runStableTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RestartRuleLifecycleOptions) {
    this.onChange = options.onChange;
    this.onRestart = options.onRestart;
    this.isActive = options.isActive;
    this.isRunning = options.isRunning;
  }

  prepareManualStart(view: RestartRuleLifecycleView): void {
    this.autoRestartSuppressed = false;
    this.clearRestartTimer();
    this.clearRestartDeadline(view);
    this.clearRunStableTimer();
    this.restartAttempts = 0;
  }

  prepareAutomaticRestart(view: RestartRuleLifecycleView): void {
    this.autoRestartSuppressed = false;
    this.clearRestartTimer();
    this.clearRestartDeadline(view);
    this.clearRunStableTimer();
  }

  suppressRestart(view: RestartRuleLifecycleView): void {
    this.autoRestartSuppressed = true;
    this.clearRestartTimer();
    this.clearRestartDeadline(view);
  }

  clearRuntimeState(view: RestartRuleLifecycleView): void {
    this.autoRestartSuppressed = false;
    this.clearRestartTimer();
    this.clearRestartDeadline(view);
    this.clearRunStableTimer();
    this.restartAttempts = 0;
  }

  noteRunning(): void {
    this.clearRunStableTimer();
    this.runStableTimer = setTimeout(() => {
      this.runStableTimer = null;
      if (!this.isActive() || !this.isRunning()) return;
      this.restartAttempts = 0;
    }, RUN_STABLE_RESET_MS);
  }

  noteExit(view: RestartRuleLifecycleView, exitCode: number | null): void {
    this.clearRunStableTimer();

    if (this.autoRestartSuppressed) {
      this.autoRestartSuppressed = false;
      this.restartAttempts = 0;
      return;
    }

    if (view.config.restart_policy === "never") return;
    if (view.config.restart_policy === "on-failure" && exitCode === 0) return;

    const attempt = this.restartAttempts + 1;
    this.restartAttempts = attempt;
    const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** (attempt - 1), RESTART_MAX_DELAY_MS);

    this.clearRestartTimer();
    this.restartDeadline = Date.now() + delay;
    view.restartInMs = delay;

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.isActive()) return;
      view.restartCount += 1;
      void this.onRestart(false).then(() => this.onChange());
    }, delay);
  }

  tick(view: RestartRuleLifecycleView, now: number): boolean {
    if (this.restartDeadline === null) return false;
    if (!this.isActive()) {
      this.restartDeadline = null;
      return true;
    }

    const remaining = Math.max(0, this.restartDeadline - now);
    if (view.restartInMs === remaining) return false;
    view.restartInMs = remaining;
    return true;
  }

  hasPendingRestart(): boolean {
    return this.restartDeadline !== null;
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) return;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private clearRestartDeadline(view: RestartRuleLifecycleView): void {
    this.restartDeadline = null;
    view.restartInMs = null;
  }

  private clearRunStableTimer(): void {
    if (!this.runStableTimer) return;
    clearTimeout(this.runStableTimer);
    this.runStableTimer = null;
  }
}
