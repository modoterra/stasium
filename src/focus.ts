import type { AppMode, PanelId, Shortcut } from "./types";

export type FocusUpdateCallback = () => void;

const MANIFEST_SHORTCUTS: Shortcut[] = [
  { key: "s", label: "start" },
  { key: "x", label: "stop" },
  { key: "r", label: "restart" },
  { key: "a", label: "add" },
  { key: "i", label: "discover" },
  { key: "d", label: "delete" },
  { key: "e", label: "edit" },
  { key: "up/down", label: "select" },
];

const LOGS_SHORTCUTS: Shortcut[] = [
  { key: "up/down", label: "scroll" },
  { key: "pgup/pgdn", label: "page" },
  { key: "f", label: "follow" },
  { key: "g", label: "top" },
  { key: "G", label: "bottom" },
  { key: "c", label: "clear" },
];

const DOCKER_SHORTCUTS: Shortcut[] = [
  { key: "s", label: "start" },
  { key: "x", label: "stop" },
  { key: "r", label: "restart" },
  { key: "up/down", label: "select" },
];

const EDITING_SHORTCUTS: Shortcut[] = [
  { key: "ctrl+s", label: "save" },
  { key: "esc", label: "cancel" },
];

const ADDING_SHORTCUTS: Shortcut[] = [
  { key: "enter", label: "confirm" },
  { key: "tab", label: "next field" },
  { key: "esc", label: "cancel" },
];

const DISCOVERING_SHORTCUTS: Shortcut[] = [
  { key: "up/down", label: "move" },
  { key: "space", label: "toggle" },
  { key: "a", label: "all" },
  { key: "n", label: "none" },
  { key: "enter", label: "confirm" },
  { key: "esc", label: "cancel" },
];

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { key: "tab", label: "switch panel" },
  { key: "q", label: "quit" },
];

const PANEL_SHORTCUTS: Record<PanelId, Shortcut[]> = {
  manifest: MANIFEST_SHORTCUTS,
  logs: LOGS_SHORTCUTS,
  docker: DOCKER_SHORTCUTS,
};

const MODE_SHORTCUTS: Record<AppMode, Shortcut[] | null> = {
  normal: null,
  editing: EDITING_SHORTCUTS,
  adding: ADDING_SHORTCUTS,
  discovering: DISCOVERING_SHORTCUTS,
};

export class FocusManager {
  private activePanel: PanelId;
  private panels: PanelId[];
  private mode: AppMode = "normal";
  private readonly updateCallbacks: Set<FocusUpdateCallback> = new Set();

  constructor(hasDocker: boolean) {
    this.panels = hasDocker ? ["manifest", "logs", "docker"] : ["manifest", "logs"];
    this.activePanel = "manifest";
  }

  onUpdate(callback: FocusUpdateCallback): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  getActivePanel(): PanelId {
    return this.activePanel;
  }

  setActivePanel(panel: PanelId): void {
    if (this.mode !== "normal") return;
    if (!this.panels.includes(panel)) return;
    if (panel === this.activePanel) return;
    this.activePanel = panel;
    this.notify();
  }

  cyclePanel(direction: 1 | -1 = 1): void {
    if (this.mode !== "normal") return;
    const currentIndex = this.panels.indexOf(this.activePanel);
    const nextIndex = (currentIndex + direction + this.panels.length) % this.panels.length;
    this.activePanel = this.panels[nextIndex] ?? this.panels[0] ?? "manifest";
    this.notify();
  }

  getMode(): AppMode {
    return this.mode;
  }

  setMode(mode: AppMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.notify();
  }

  getShortcuts(): Shortcut[] {
    const modeShortcuts = MODE_SHORTCUTS[this.mode];
    if (modeShortcuts) return modeShortcuts;
    const panelShortcuts = PANEL_SHORTCUTS[this.activePanel] ?? [];
    return [...panelShortcuts, ...GLOBAL_SHORTCUTS];
  }

  isPanelActive(panel: PanelId): boolean {
    return this.activePanel === panel;
  }

  private notify(): void {
    for (const callback of this.updateCallbacks) {
      callback();
    }
  }
}
