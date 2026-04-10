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
  { key: "up/down", label: "select" },
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
  { key: "pgup/pgdn", label: "log page" },
  { key: "home/end", label: "log jump" },
  { key: "1", label: "manifest panel" },
  { key: "2", label: "docker panel" },
  { key: "3", label: "logs panel" },
  { key: "4", label: "all panels" },
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
  private readonly panels: PanelId[];
  private visiblePanels: PanelId[];
  private mode: AppMode = "normal";
  private readonly updateCallbacks: Set<FocusUpdateCallback> = new Set();

  constructor(hasDocker: boolean) {
    this.panels = hasDocker ? ["manifest", "docker", "logs"] : ["manifest", "logs"];
    this.visiblePanels = [...this.panels];
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
    if (!this.visiblePanels.includes(panel)) return;
    if (panel === this.activePanel) return;
    this.activePanel = panel;
    this.notify();
  }

  cyclePanel(direction: 1 | -1 = 1): void {
    if (this.mode !== "normal") return;
    const currentIndex = this.visiblePanels.indexOf(this.activePanel);
    const nextIndex =
      (currentIndex + direction + this.visiblePanels.length) % this.visiblePanels.length;
    this.activePanel = this.visiblePanels[nextIndex] ?? this.visiblePanels[0] ?? "manifest";
    this.notify();
  }

  getVisiblePanels(): PanelId[] {
    return [...this.visiblePanels];
  }

  isPanelVisible(panel: PanelId): boolean {
    return this.visiblePanels.includes(panel);
  }

  togglePanel(panel: PanelId): void {
    if (this.mode !== "normal") return;
    if (!this.panels.includes(panel)) return;

    if (this.visiblePanels.includes(panel)) {
      if (this.visiblePanels.length === 1) return;
      this.visiblePanels = this.visiblePanels.filter((visiblePanel) => visiblePanel !== panel);
    } else {
      const nextVisible = new Set([...this.visiblePanels, panel]);
      this.visiblePanels = this.panels.filter((visiblePanel) => nextVisible.has(visiblePanel));
    }

    this.ensureActivePanelVisible(this.visiblePanels);
    this.notify();
  }

  showAllPanels(): void {
    if (this.mode !== "normal") return;
    if (this.visiblePanels.length === this.panels.length) return;
    this.visiblePanels = [...this.panels];
    this.notify();
  }

  ensureActivePanelVisible(availablePanels: PanelId[]): void {
    if (availablePanels.length === 0) return;
    if (availablePanels.includes(this.activePanel)) return;
    this.activePanel = availablePanels[0] ?? "manifest";
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
    const globalShortcuts = this.panels.includes("docker")
      ? GLOBAL_SHORTCUTS
      : GLOBAL_SHORTCUTS.filter((shortcut) => shortcut.label !== "docker panel");
    return [...panelShortcuts, ...globalShortcuts];
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
