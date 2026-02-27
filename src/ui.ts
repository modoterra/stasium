import {
  BoxRenderable,
  type CliRenderer,
  CodeRenderable,
  InputRenderable,
  SyntaxStyle,
  TextAttributes,
  TextRenderable,
  TextareaRenderable,
} from "@opentui/core";
import type { DiscoverySelection, SelectionItem } from "./discovery";
import type { DockerManager } from "./docker";
import type { FocusManager } from "./focus";
import type { ServiceManager, ServiceView } from "./service-manager";
import { formatCommandSpec } from "./shared";
import type { DockerService, Manifest, PanelId, Shortcut } from "./types";

interface Palette {
  active: string;
  muted: string;
  panel: string;
  accent: string;
  amber: string;
  green: string;
  red: string;
  bg: string;
  modal: string;
  input: string;
}

const dark: Palette = {
  active: "#d8dee9",
  muted: "#7f8c9a",
  panel: "#1e2430",
  accent: "#6cb6ff",
  amber: "#f4b259",
  green: "#45c97a",
  red: "#ef5b5b",
  bg: "#161b22",
  modal: "#151b24",
  input: "#161b22",
};

const light: Palette = {
  active: "#1e2530",
  muted: "#6b7685",
  panel: "#e8ecf0",
  accent: "#2176d6",
  amber: "#c47e15",
  green: "#1a8c42",
  red: "#d03030",
  bg: "#f0f3f6",
  modal: "#d5dbe2",
  input: "#ffffff",
};

const getTheme = (mode: "dark" | "light" | null): Palette => (mode === "light" ? light : dark);
const VERSION_LABEL = "Stasium v0.2.3 (32423)";

const stateColor = (state: ServiceView["state"], palette: Palette): string => {
  switch (state) {
    case "RUNNING":
      return palette.green;
    case "STARTING":
      return palette.amber;
    case "STOPPING":
      return palette.amber;
    case "FAILED":
      return palette.red;
    default:
      return palette.muted;
  }
};

const dockerStateColor = (state: DockerService["state"], palette: Palette): string => {
  switch (state) {
    case "running":
      return palette.green;
    case "restarting":
      return palette.amber;
    case "paused":
      return palette.amber;
    case "exited":
      return palette.red;
    case "dead":
      return palette.red;
    default:
      return palette.muted;
  }
};

const formatState = (state: ServiceView["state"]) => state.padEnd(8, " ");

const formatDockerState = (state: DockerService["state"]) => state.padEnd(10, " ");

const formatExit = (exit: number | null) => {
  if (exit === null) return "--";
  return String(exit);
};

const createLogSyntaxStyle = (): SyntaxStyle => {
  return SyntaxStyle.create();
};

export interface UiOptions {
  renderer: CliRenderer;
  manifest: Manifest;
  manager: ServiceManager;
  focusManager: FocusManager;
  dockerManager: DockerManager | null;
}

export interface UiControls {
  showEditOverlay: (toml: string) => void;
  hideEditOverlay: () => void;
  getEditContent: () => string;
  setEditError: (message: string) => void;
  clearEditError: () => void;
  showAddOverlay: () => void;
  hideAddOverlay: () => void;
  cycleAddFocus: () => void;
  getAddName: () => string;
  getAddCommand: () => string;
  setAddError: (message: string) => void;
  clearAddError: () => void;
  showDeleteConfirm: (name: string) => void;
  hideDeleteConfirm: () => void;
  renderAll: () => void;
  scrollLogs: (delta: number) => void;
  scrollLogsPage: (deltaPages: number) => void;
  scrollLogsToTop: () => void;
  scrollLogsToBottom: () => void;
  clearLogs: () => void;
}

export const buildUi = (opts: UiOptions): { teardown: () => void; controls: UiControls } => {
  const { renderer, manifest, manager, focusManager, dockerManager } = opts;
  const hasDocker = dockerManager !== null;
  let palette = getTheme(renderer.themeMode);
  const logStyle = createLogSyntaxStyle();

  // Root
  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    gap: 1,
  });

  // Header
  const header = new BoxRenderable(renderer, {
    padding: 1,
    alignItems: "center",
  });

  const headerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  });

  const title = new TextRenderable(renderer, {
    content: manifest.path,
    fg: palette.muted,
  });

  const versionPill = new BoxRenderable(renderer, {
    paddingX: 1,
    alignItems: "center",
  });

  const versionText = new TextRenderable(renderer, {
    content: VERSION_LABEL,
    fg: palette.active,
  });

  versionPill.add(versionText);

  headerRow.add(title);
  headerRow.add(versionPill);
  header.add(headerRow);

  // Main area
  const main = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "row",
    gap: 2,
  });

  const sideColumn = new BoxRenderable(renderer, {
    width: hasDocker ? "25%" : "35%",
    flexDirection: "column",
    gap: 2,
  });

  // Manifest panel
  const manifestPanel = new BoxRenderable(renderer, {
    backgroundColor: palette.panel,
    flexDirection: "column",
    padding: 2,
    paddingLeft: 3,
    gap: 1,
  });

  const manifestPanelTitle = new TextRenderable(renderer, {
    content: "Manifest",
    fg: focusManager.isPanelActive("manifest") ? palette.accent : palette.active,
    attributes: TextAttributes.BOLD,
  });
  manifestPanel.add(manifestPanelTitle);

  const listContainer = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "column",
  });
  manifestPanel.add(listContainer);

  // Docker panel (conditional)
  let dockerPanel: BoxRenderable | null = null;
  let dockerPanelTitle: TextRenderable | null = null;
  let dockerListContainer: BoxRenderable | null = null;

  if (hasDocker) {
    dockerPanel = new BoxRenderable(renderer, {
      backgroundColor: palette.panel,
      flexDirection: "column",
      padding: 2,
      paddingLeft: 3,
      gap: 1,
    });

    dockerPanelTitle = new TextRenderable(renderer, {
      content: "Docker",
      fg: focusManager.isPanelActive("docker") ? palette.accent : palette.active,
      attributes: TextAttributes.BOLD,
    });
    dockerPanel.add(dockerPanelTitle);

    dockerListContainer = new BoxRenderable(renderer, {
      flexGrow: 1,
      flexDirection: "column",
    });
    dockerPanel.add(dockerListContainer);
  }

  // Log panel
  const logPanel = new BoxRenderable(renderer, {
    flexGrow: 1,
    backgroundColor: palette.panel,
    padding: 2,
    paddingLeft: 3,
    flexDirection: "column",
    gap: 1,
  });

  const logPanelTitle = new TextRenderable(renderer, {
    content: "Logs",
    fg: focusManager.isPanelActive("logs") ? palette.accent : palette.active,
    attributes: TextAttributes.BOLD,
  });
  logPanel.add(logPanelTitle);

  const logCode = new CodeRenderable(renderer, {
    id: "log-code",
    content: "",
    syntaxStyle: logStyle,
    flexGrow: 1,
    wrapMode: "char",
    drawUnstyledText: true,
    fg: palette.muted,
  });
  logPanel.add(logCode);

  // Assemble main
  sideColumn.add(manifestPanel);
  if (dockerPanel) {
    sideColumn.add(dockerPanel);
  }
  main.add(sideColumn);
  main.add(logPanel);

  // Footer
  const footer = new BoxRenderable(renderer, {
    padding: 1,
    alignItems: "center",
    justifyContent: "center",
  });

  const footerPill = new BoxRenderable(renderer, {
    paddingX: 1,
    alignItems: "center",
    width: "100%",
  });

  const footerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    justifyContent: "center",
    alignItems: "center",
  });
  footerPill.add(footerRow);
  footer.add(footerPill);

  let footerItems: TextRenderable[] = [];

  const footerAbbreviations: Record<string, string> = {
    restart: "rst",
    delete: "del",
    select: "sel",
    switch: "swap",
    "switch panel": "swap",
    "next field": "next",
    confirm: "ok",
    cancel: "esc",
    scroll: "scr",
    bottom: "end",
    logs: "log",
    start: "run",
    stop: "halt",
  };

  const FOOTER_ITEM_GAP = 2;
  const FOOTER_PADDING = 6;

  const measureFooterWidth = (shortcuts: Shortcut[], labelMode: "full" | "abbr") => {
    if (shortcuts.length === 0) return 0;
    const labels = shortcuts.map((shortcut) =>
      labelMode === "abbr"
        ? (footerAbbreviations[shortcut.label] ?? shortcut.label)
        : shortcut.label,
    );
    const itemLengths = shortcuts.reduce((sum, shortcut, index) => {
      return sum + shortcut.key.length + (labels[index]?.length ?? 0);
    }, 0);
    const itemCount = shortcuts.length * 2;
    const gapCount = Math.max(0, itemCount - 1);
    return itemLengths + gapCount * FOOTER_ITEM_GAP;
  };

  const getFooterLayout = () => {
    const shortcuts = focusManager.getShortcuts();
    const available = Math.max(0, renderer.width - FOOTER_PADDING);

    if (measureFooterWidth(shortcuts, "full") <= available) {
      return { labelMode: "full" as const, shortcuts };
    }

    if (measureFooterWidth(shortcuts, "abbr") <= available) {
      return { labelMode: "abbr" as const, shortcuts };
    }

    let count = shortcuts.length;
    while (count > 1 && measureFooterWidth(shortcuts.slice(0, count), "abbr") > available) {
      count -= 1;
    }

    return { labelMode: "abbr" as const, shortcuts: shortcuts.slice(0, count) };
  };

  const rebuildFooter = () => {
    for (const item of footerItems) {
      footerRow.remove(item.id);
      item.destroy();
    }
    footerItems = [];

    const { labelMode, shortcuts } = getFooterLayout();
    shortcuts.forEach((shortcut, i) => {
      const keyText = new TextRenderable(renderer, {
        id: `footer-key-${i}`,
        content: shortcut.key,
        fg: palette.active,
      });
      footerRow.add(keyText);
      footerItems.push(keyText);

      const label =
        labelMode === "abbr"
          ? (footerAbbreviations[shortcut.label] ?? shortcut.label)
          : shortcut.label;
      const labelText = new TextRenderable(renderer, {
        id: `footer-label-${i}`,
        content: label,
        fg: palette.muted,
      });
      footerRow.add(labelText);
      footerItems.push(labelText);
    });
  };

  rebuildFooter();

  const applyLayout = () => {
    const narrow = renderer.width < 110;
    main.flexDirection = narrow ? "column" : "row";
    main.gap = narrow ? 1 : 2;

    if (narrow) {
      sideColumn.width = "100%";
      sideColumn.flexGrow = 0;
      manifestPanel.height = hasDocker ? "28%" : "35%";
      manifestPanel.flexGrow = 0;

      if (dockerPanel) {
        dockerPanel.height = "22%";
        dockerPanel.flexGrow = 0;
      }

      logPanel.width = "100%";
      logPanel.flexGrow = 1;
    } else {
      sideColumn.width = hasDocker ? "25%" : "35%";
      sideColumn.flexGrow = 0;
      manifestPanel.height = "auto";
      manifestPanel.flexGrow = 0;

      if (dockerPanel) {
        dockerPanel.height = "auto";
        dockerPanel.flexGrow = 0;
      }

      logPanel.width = "auto";
      logPanel.flexGrow = 1;
    }

    rebuildFooter();
    renderer.requestRender();
  };

  renderer.on("resize", applyLayout);
  applyLayout();

  root.add(header);
  root.add(main);
  root.add(footer);

  // Overlay container (absolute positioned)
  const overlayBg = new BoxRenderable(renderer, {
    id: "overlay-bg",
    position: "absolute",
    width: "100%",
    height: "100%",
    visible: false,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  });

  // Edit overlay
  const editOverlay = new BoxRenderable(renderer, {
    id: "edit-overlay",
    width: "60%",
    height: "60%",
    backgroundColor: palette.modal,
    flexDirection: "column",
    padding: 2,
    gap: 1,
    visible: false,
  });

  const editTitle = new TextRenderable(renderer, {
    content: "edit service  (ctrl+s save, esc cancel)",
    fg: palette.accent,
  });
  editOverlay.add(editTitle);

  const editError = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
  });
  editOverlay.add(editError);

  const editTextarea = new TextareaRenderable(renderer, {
    id: "edit-textarea",
    flexGrow: 1,
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.input,
    wrapMode: "char",
  });
  editOverlay.add(editTextarea);

  // Add overlay
  const addOverlay = new BoxRenderable(renderer, {
    id: "add-overlay",
    width: 50,
    backgroundColor: palette.modal,
    flexDirection: "column",
    padding: 2,
    gap: 1,
    visible: false,
  });

  const addTitle = new TextRenderable(renderer, {
    content: "add service  (enter confirm, esc cancel)",
    fg: palette.accent,
  });
  addOverlay.add(addTitle);

  const addNameLabel = new TextRenderable(renderer, {
    content: "name:",
    fg: palette.muted,
  });
  addOverlay.add(addNameLabel);

  const addNameField = new BoxRenderable(renderer, {
    width: "100%",
    backgroundColor: palette.input,
    paddingX: 1,
    paddingY: 0,
  });

  const addNameInput = new InputRenderable(renderer, {
    id: "add-name",
    placeholder: "service name",
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.input,
    width: "100%",
  });
  addNameField.add(addNameInput);
  addOverlay.add(addNameField);

  const addCommandLabel = new TextRenderable(renderer, {
    content: "command:",
    fg: palette.muted,
  });
  addOverlay.add(addCommandLabel);

  const addCommandField = new BoxRenderable(renderer, {
    width: "100%",
    backgroundColor: palette.input,
    paddingX: 1,
    paddingY: 0,
  });

  const addCommandInput = new InputRenderable(renderer, {
    id: "add-command",
    placeholder: "e.g. bun run dev",
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.input,
    width: "100%",
  });
  addCommandField.add(addCommandInput);
  addOverlay.add(addCommandField);

  const addError = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
  });
  addOverlay.add(addError);

  // Delete confirm overlay
  const deleteOverlay = new BoxRenderable(renderer, {
    id: "delete-overlay",
    width: 50,
    backgroundColor: palette.modal,
    flexDirection: "column",
    padding: 2,
    gap: 1,
    visible: false,
  });

  const deleteTitle = new TextRenderable(renderer, {
    content: "delete service",
    fg: palette.red,
  });
  deleteOverlay.add(deleteTitle);

  const deleteMessage = new TextRenderable(renderer, {
    content: "Are you sure? (y/n)",
    fg: palette.active,
  });
  deleteOverlay.add(deleteMessage);

  overlayBg.add(editOverlay);
  overlayBg.add(addOverlay);
  overlayBg.add(deleteOverlay);

  root.add(overlayBg);
  renderer.root.add(root);

  // State
  let listLines: TextRenderable[] = [];
  let dockerLines: TextRenderable[] = [];
  let logSource: "manifest" | "docker" = "manifest";
  let lastLogVersion = -1;
  let lastSelectedIndex = -1;
  let lastLogSource: "manifest" | "docker" = "manifest";
  let addFocusField: "name" | "command" = "name";

  const panelTitleColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.accent : palette.active;

  const rebuildList = (views: ServiceView[], selectedIndex: number) => {
    for (const line of listLines) {
      listContainer.remove(line.id);
      line.destroy();
    }
    listLines = [];

    views.forEach((view, index) => {
      const selected = index === selectedIndex;
      const prefix = selected ? ">" : " ";
      const status = formatState(view.state);
      const exitCode = formatExit(view.lastExitCode);
      const restartInfo =
        view.restartInMs !== null ? `  restarting_in:${Math.ceil(view.restartInMs)}ms` : "";
      const content = `${prefix} ${status} ${view.name}  exit:${exitCode}  restarts:${view.restartCount}${restartInfo}`;
      const line = new TextRenderable(renderer, {
        id: `service-${index}`,
        content,
        fg: selected ? palette.active : stateColor(view.state, palette),
      });
      listContainer.add(line);
      listLines.push(line);
    });
  };

  const rebuildDockerList = () => {
    if (!dockerManager || !dockerListContainer) return;

    for (const line of dockerLines) {
      dockerListContainer.remove(line.id);
      line.destroy();
    }
    dockerLines = [];

    const services = dockerManager.getServices();
    const selectedIdx = dockerManager.getSelectedIndex();

    services.forEach((svc, index) => {
      const selected = index === selectedIdx;
      const prefix = selected ? ">" : " ";
      const status = formatDockerState(svc.state);
      const content = `${prefix} ${status} ${svc.name}`;
      const line = new TextRenderable(renderer, {
        id: `docker-${index}`,
        content,
        fg: selected ? palette.active : dockerStateColor(svc.state, palette),
      });
      dockerListContainer.add(line);
      dockerLines.push(line);
    });
  };

  const rebuildLogs = () => {
    const source = logSource === "docker" && dockerManager ? "docker" : "manifest";
    const selectedIndex =
      source === "docker" ? (dockerManager?.getSelectedIndex() ?? 0) : manager.getSelectedIndex();
    const buffer =
      source === "docker"
        ? (dockerManager?.getActiveLogBuffer() ?? null)
        : (manager.getSelectedView()?.log ?? null);
    const version = buffer ? buffer.getVersion() : 0;

    if (
      version === lastLogVersion &&
      selectedIndex === lastSelectedIndex &&
      source === lastLogSource
    ) {
      return;
    }

    lastLogVersion = version;
    lastSelectedIndex = selectedIndex;
    lastLogSource = source;

    logCode.content = buffer ? buffer.getFullText() : "";
  };

  const renderAll = () => {
    const activePanel = focusManager.getActivePanel();
    if (activePanel === "manifest") {
      logSource = "manifest";
    } else if (activePanel === "docker" && dockerManager) {
      logSource = "docker";
    }

    const views = manager.getViews();
    rebuildList(views, manager.getSelectedIndex());
    rebuildLogs();
    rebuildDockerList();

    // Update panel titles
    manifestPanelTitle.fg = panelTitleColor("manifest");
    logPanelTitle.fg = panelTitleColor("logs");
    if (dockerPanelTitle) {
      dockerPanelTitle.fg = panelTitleColor("docker");
    }

    // Update footer
    rebuildFooter();

    renderer.requestRender();
  };

  const applyTheme = () => {
    palette = getTheme(renderer.themeMode);
    title.fg = palette.muted;
    versionText.fg = palette.active;
    manifestPanel.backgroundColor = palette.panel;
    logPanel.backgroundColor = palette.panel;
    logCode.fg = palette.muted;
    rebuildFooter();

    if (dockerPanel) {
      dockerPanel.backgroundColor = palette.panel;
    }

    editOverlay.backgroundColor = palette.modal;
    editTitle.fg = palette.accent;
    editError.fg = palette.red;
    editTextarea.backgroundColor = palette.input;
    editTextarea.textColor = palette.active;
    addOverlay.backgroundColor = palette.modal;
    addTitle.fg = palette.accent;
    addError.fg = palette.red;
    addNameLabel.fg = palette.muted;
    addCommandLabel.fg = palette.muted;
    addNameField.backgroundColor = palette.input;
    addNameInput.backgroundColor = palette.input;
    addNameInput.textColor = palette.active;
    addCommandField.backgroundColor = palette.input;
    addCommandInput.backgroundColor = palette.input;
    addCommandInput.textColor = palette.active;
    deleteOverlay.backgroundColor = palette.modal;
    deleteTitle.fg = palette.red;
    deleteMessage.fg = palette.active;

    lastLogVersion = -1;
    lastSelectedIndex = -1;
    renderAll();
  };

  renderer.on("theme_mode", applyTheme);

  renderAll();
  const unsubManager = manager.onUpdate(renderAll);
  const unsubFocus = focusManager.onUpdate(renderAll);
  const unsubDocker = dockerManager ? dockerManager.onUpdate(renderAll) : () => {};

  const controls: UiControls = {
    showEditOverlay(toml: string) {
      overlayBg.visible = true;
      editOverlay.visible = true;
      addOverlay.visible = false;
      deleteOverlay.visible = false;
      editError.content = "";
      editTextarea.initialValue = toml;
      editTextarea.focus();
      renderer.requestRender();
    },

    hideEditOverlay() {
      overlayBg.visible = false;
      editOverlay.visible = false;
      editError.content = "";
      editTextarea.blur();
      renderer.requestRender();
    },

    getEditContent(): string {
      return editTextarea.plainText;
    },

    setEditError(message: string) {
      editError.content = message;
      renderer.requestRender();
    },

    clearEditError() {
      editError.content = "";
      renderer.requestRender();
    },

    showAddOverlay() {
      overlayBg.visible = true;
      addOverlay.visible = true;
      editOverlay.visible = false;
      deleteOverlay.visible = false;
      addError.content = "";
      addFocusField = "name";
      addNameInput.value = "";
      addCommandInput.value = "";
      addNameInput.focus();
      addCommandInput.blur();
      renderer.requestRender();
    },

    hideAddOverlay() {
      overlayBg.visible = false;
      addOverlay.visible = false;
      addError.content = "";
      addNameInput.blur();
      addCommandInput.blur();
      renderer.requestRender();
    },

    cycleAddFocus() {
      if (addFocusField === "name") {
        addFocusField = "command";
        addNameInput.blur();
        addCommandInput.focus();
      } else {
        addFocusField = "name";
        addCommandInput.blur();
        addNameInput.focus();
      }
      renderer.requestRender();
    },

    getAddName(): string {
      return addNameInput.value;
    },

    getAddCommand(): string {
      return addCommandInput.value;
    },

    setAddError(message: string) {
      addError.content = message;
      renderer.requestRender();
    },

    clearAddError() {
      addError.content = "";
      renderer.requestRender();
    },

    showDeleteConfirm(name: string) {
      overlayBg.visible = true;
      deleteOverlay.visible = true;
      editOverlay.visible = false;
      addOverlay.visible = false;
      deleteMessage.content = `Delete "${name}"? (y/n)`;
      renderer.requestRender();
    },

    hideDeleteConfirm() {
      overlayBg.visible = false;
      deleteOverlay.visible = false;
      renderer.requestRender();
    },

    renderAll,

    scrollLogs(delta: number) {
      const next = Math.max(0, Math.min(logCode.scrollY + delta, logCode.maxScrollY));
      logCode.scrollY = next;
      renderer.requestRender();
    },

    scrollLogsPage(deltaPages: number) {
      const pageSize = Math.max(1, Math.floor(logCode.height) - 1);
      const next = Math.max(
        0,
        Math.min(logCode.scrollY + pageSize * deltaPages, logCode.maxScrollY),
      );
      logCode.scrollY = next;
      renderer.requestRender();
    },

    scrollLogsToTop() {
      logCode.scrollY = 0;
      renderer.requestRender();
    },

    scrollLogsToBottom() {
      logCode.scrollY = logCode.maxScrollY;
      renderer.requestRender();
    },

    clearLogs() {
      const source = logSource === "docker" && dockerManager ? "docker" : "manifest";
      if (source === "docker") {
        const buffer = dockerManager?.getSelectedLogBuffer() ?? null;
        if (buffer) {
          buffer.clear();
          lastLogVersion = -1;
          lastSelectedIndex = -1;
          lastLogSource = source;
          renderAll();
        }
        return;
      }

      const view = manager.getSelectedView();
      if (view) {
        view.log.clear();
        lastLogVersion = -1;
        lastSelectedIndex = -1;
        lastLogSource = source;
        renderAll();
      }
    },
  };

  const teardown = () => {
    renderer.off("theme_mode", applyTheme);
    renderer.off("resize", applyLayout);
    unsubManager();
    unsubFocus();
    unsubDocker();
    logStyle.destroy();
    root.destroy();
  };

  return { teardown, controls };
};

interface InitUiOptions {
  selection: DiscoverySelection;
  warnings: string[];
}

const formatInitSelectionLine = (item: SelectionItem, active: boolean): string => {
  const cursor = active ? ">" : " ";
  const selected = item.selected ? "[x]" : "[ ]";
  const serviceName = item.candidate.service.name;
  const command = formatCommandSpec(item.candidate.service.command);
  return `${cursor} ${selected} ${serviceName}  ${command}`;
};

export const buildInitUi = (renderer: CliRenderer, opts: InitUiOptions): (() => void) => {
  const { selection, warnings } = opts;
  let palette = getTheme(renderer.themeMode);

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    gap: 1,
  });

  const header = new BoxRenderable(renderer, {
    padding: 1,
    alignItems: "center",
  });

  const headerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  });

  const title = new TextRenderable(renderer, {
    content: "initialize",
    fg: palette.muted,
  });

  const versionPill = new BoxRenderable(renderer, {
    paddingX: 1,
    alignItems: "center",
  });

  const versionText = new TextRenderable(renderer, {
    content: VERSION_LABEL,
    fg: palette.active,
  });

  versionPill.add(versionText);

  headerRow.add(title);
  headerRow.add(versionPill);
  header.add(headerRow);

  const main = new BoxRenderable(renderer, {
    flexGrow: 1,
    padding: 1,
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  });

  const card = new BoxRenderable(renderer, {
    width: 86,
    backgroundColor: palette.panel,
    padding: 2,
    flexDirection: "column",
    gap: 1,
  });

  const cardTitle = new TextRenderable(renderer, {
    content: "initialize",
    fg: palette.muted,
  });
  card.add(cardTitle);

  const noManifest = new TextRenderable(renderer, {
    content: "No stasium.toml found in this directory.",
    fg: palette.active,
  });
  card.add(noManifest);

  const detectedSummary = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
  });
  card.add(detectedSummary);

  const selectionContainer = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 0,
  });
  card.add(selectionContainer);

  const warningTitle = new TextRenderable(renderer, {
    content: "",
    fg: palette.amber,
  });
  card.add(warningTitle);

  const warningContainer = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 0,
  });
  card.add(warningContainer);

  const prompt = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
  });
  card.add(prompt);

  main.add(card);

  const footer = new BoxRenderable(renderer, {
    padding: 1,
    alignItems: "center",
    justifyContent: "center",
  });

  const footerPill = new BoxRenderable(renderer, {
    paddingX: 1,
    alignItems: "center",
    width: "100%",
  });

  const footerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  });
  footerPill.add(footerRow);
  footer.add(footerPill);

  const initShortcuts = [
    { key: "up/down", label: "move" },
    { key: "space", label: "toggle" },
    { key: "a", label: "all" },
    { key: "n", label: "none" },
    { key: "enter", label: "create" },
    { key: "q", label: "quit" },
  ];

  const footerItems: TextRenderable[] = [];
  for (let i = 0; i < initShortcuts.length; i++) {
    const shortcut = initShortcuts[i];
    if (!shortcut) continue;

    const keyText = new TextRenderable(renderer, {
      id: `init-footer-key-${i}`,
      content: shortcut.key,
      fg: palette.active,
    });
    footerRow.add(keyText);
    footerItems.push(keyText);

    const labelText = new TextRenderable(renderer, {
      id: `init-footer-label-${i}`,
      content: shortcut.label,
      fg: palette.muted,
    });
    footerRow.add(labelText);
    footerItems.push(labelText);
  }

  root.add(header);
  root.add(main);
  root.add(footer);
  renderer.root.add(root);

  let selectionLines: TextRenderable[] = [];
  let warningLines: TextRenderable[] = [];

  const clearSelectionLines = () => {
    for (const line of selectionLines) {
      selectionContainer.remove(line.id);
      line.destroy();
    }
    selectionLines = [];
  };

  const clearWarningLines = () => {
    for (const line of warningLines) {
      warningContainer.remove(line.id);
      line.destroy();
    }
    warningLines = [];
  };

  const rebuildSelectionLines = () => {
    clearSelectionLines();

    const items = selection.getItems();
    const total = items.length;
    const selectedCount = selection.getSelectedCount();

    if (total === 0) {
      detectedSummary.content = "\nNo services detected. A template manifest will be created.";
      prompt.content = "\nPress enter to create stasium.toml, or q to quit.";
      return;
    }

    detectedSummary.content = `\nDetected ${total} service${total === 1 ? "" : "s"} (${selectedCount} selected):`;
    prompt.content = "\nPress enter to create stasium.toml, or q to quit.";

    const cursor = selection.getCursor();

    items.forEach((item, index) => {
      const active = index === cursor;
      const line = new TextRenderable(renderer, {
        id: `init-selection-${index}`,
        content: formatInitSelectionLine(item, active),
        fg: active ? palette.accent : item.selected ? palette.green : palette.muted,
      });
      selectionContainer.add(line);
      selectionLines.push(line);
    });
  };

  const rebuildWarnings = () => {
    clearWarningLines();

    if (warnings.length === 0) {
      warningTitle.content = "";
      return;
    }

    warningTitle.content = "\nWarnings:";
    warnings.forEach((warning, index) => {
      const line = new TextRenderable(renderer, {
        id: `init-warning-${index}`,
        content: `  - ${warning}`,
        fg: palette.amber,
      });
      warningContainer.add(line);
      warningLines.push(line);
    });
  };

  const renderAll = () => {
    rebuildSelectionLines();
    rebuildWarnings();
    renderer.requestRender();
  };

  const applyTheme = () => {
    palette = getTheme(renderer.themeMode);
    title.fg = palette.muted;
    versionText.fg = palette.active;
    card.backgroundColor = palette.panel;
    cardTitle.fg = palette.muted;
    noManifest.fg = palette.active;
    detectedSummary.fg = palette.muted;
    warningTitle.fg = palette.amber;
    prompt.fg = palette.muted;

    for (const item of footerItems) {
      const isKey = item.id.includes("-key-");
      item.fg = isKey ? palette.active : palette.muted;
    }

    renderAll();
  };

  const unsubSelection = selection.onUpdate(renderAll);

  renderer.on("theme_mode", applyTheme);
  renderAll();

  return () => {
    renderer.off("theme_mode", applyTheme);
    unsubSelection();
    root.destroy();
  };
};
