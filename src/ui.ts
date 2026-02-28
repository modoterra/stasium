import {
  BoxRenderable,
  type CliRenderer,
  CodeRenderable,
  InputRenderable,
  RGBA,
  ScrollBoxRenderable,
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
  element: string;
  accent: string;
  secondary: string;
  amber: string;
  green: string;
  red: string;
  bg: string;
  border: string;
  borderActive: string;
  overlay: RGBA;
  modal: string;
  input: string;
  inputFocus: string;
}

const dark: Palette = {
  active: "#eeeeee",
  muted: "#8a8a8a",
  panel: "#141414",
  element: "#1e1e1e",
  accent: "#fab283",
  secondary: "#5c9cf5",
  amber: "#f5a742",
  green: "#7fd88f",
  red: "#e06c75",
  bg: "#0a0a0a",
  border: "#484848",
  borderActive: "#606060",
  overlay: RGBA.fromInts(0, 0, 0, 150),
  modal: "#141414",
  input: "#1e1e1e",
  inputFocus: "#282828",
};

const light: Palette = {
  active: "#1a1a1a",
  muted: "#8a8a8a",
  panel: "#fafafa",
  element: "#f5f5f5",
  accent: "#3b7dd8",
  secondary: "#7b5bb6",
  amber: "#d68c27",
  green: "#3d9a57",
  red: "#d1383d",
  bg: "#ffffff",
  border: "#b8b8b8",
  borderActive: "#a0a0a0",
  overlay: RGBA.fromInts(0, 0, 0, 110),
  modal: "#ffffff",
  input: "#ffffff",
  inputFocus: "#f5f5f5",
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const truncateText = (value: string, max: number): string => {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
};

const padRight = (value: string, width: number): string => {
  if (width <= 0) return "";
  return truncateText(value, width).padEnd(width, " ");
};

const formatManifestLine = (view: ServiceView, selected: boolean, rowWidth: number): string => {
  if (rowWidth <= 0) return "";
  const prefix = selected ? ">" : " ";
  const status = formatState(view.state);
  const meta =
    view.restartInMs !== null
      ? `retry:${Math.ceil(view.restartInMs)}ms rst:${view.restartCount}`
      : `exit:${formatExit(view.lastExitCode)} rst:${view.restartCount}`;

  const baseWidth = 2 + status.length + 1;
  const metaWidth = rowWidth >= 56 ? 22 : rowWidth >= 46 ? 16 : 0;
  const nameWidth = Math.max(4, rowWidth - baseWidth - (metaWidth > 0 ? metaWidth + 1 : 0));
  const name = padRight(view.name, nameWidth);

  if (metaWidth > 0) {
    const right = padRight(meta, metaWidth);
    return `${prefix} ${status} ${name} ${right}`.slice(0, rowWidth);
  }

  return `${prefix} ${status} ${name}`.slice(0, rowWidth);
};

const formatDockerLine = (service: DockerService, selected: boolean, rowWidth: number): string => {
  if (rowWidth <= 0) return "";
  const prefix = selected ? ">" : " ";
  const status = formatDockerState(service.state);
  const meta = service.ports ? `ports:${service.ports}` : service.status;

  const baseWidth = 2 + status.length + 1;
  const metaWidth = rowWidth >= 52 ? 18 : rowWidth >= 42 ? 12 : 0;
  const nameWidth = Math.max(4, rowWidth - baseWidth - (metaWidth > 0 ? metaWidth + 1 : 0));
  const name = padRight(service.name, nameWidth);

  if (metaWidth > 0) {
    const right = padRight(meta, metaWidth);
    return `${prefix} ${status} ${name} ${right}`.slice(0, rowWidth);
  }

  return `${prefix} ${status} ${name}`.slice(0, rowWidth);
};

const ensureIndexVisible = (box: ScrollBoxRenderable, index: number): void => {
  const children = box.getChildren();
  const row = children[index];
  if (!row) return;

  const viewportHeight = Math.max(1, Math.floor(box.viewport.height));
  const top = box.scrollTop;
  const bottom = top + viewportHeight - 1;

  if (row.y < top) {
    box.scrollTo(Math.max(0, row.y));
    return;
  }

  if (row.y > bottom) {
    box.scrollTo(Math.max(0, row.y - viewportHeight + 1));
  }
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
  toggleLogsFollowTail: () => boolean;
  setLogsFollowTail: (enabled: boolean) => void;
  clearLogs: () => void;
}

export const buildUi = (opts: UiOptions): { teardown: () => void; controls: UiControls } => {
  const { renderer, manifest, manager, focusManager, dockerManager } = opts;
  const hasDocker = dockerManager !== null;
  let palette = getTheme(renderer.themeMode);
  const logStyle = createLogSyntaxStyle();

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    backgroundColor: palette.bg,
    flexDirection: "column",
  });

  const header = new BoxRenderable(renderer, {
    flexShrink: 0,
    backgroundColor: palette.panel,
    border: ["bottom"],
    borderColor: palette.border,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 2,
  });

  const headerLeft = new BoxRenderable(renderer, {
    flexGrow: 1,
    minWidth: 0,
    flexDirection: "column",
  });

  const headerTitle = new TextRenderable(renderer, {
    content: "Stasium",
    fg: palette.active,
    attributes: TextAttributes.BOLD,
    wrapMode: "none",
    truncate: true,
  });

  const headerPath = new TextRenderable(renderer, {
    content: manifest.path,
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });

  headerLeft.add(headerTitle);
  headerLeft.add(headerPath);

  const headerRight = new BoxRenderable(renderer, {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 0,
    flexShrink: 0,
  });

  const headerVersion = new TextRenderable(renderer, {
    content: VERSION_LABEL,
    fg: palette.active,
    wrapMode: "none",
    truncate: true,
  });

  const headerStatus = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });

  headerRight.add(headerVersion);
  headerRight.add(headerStatus);

  header.add(headerLeft);
  header.add(headerRight);

  const main = new BoxRenderable(renderer, {
    flexGrow: 1,
    paddingTop: 1,
    paddingLeft: 1,
    paddingRight: 1,
    flexDirection: "row",
    gap: 1,
  });

  const sideColumn = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexShrink: 0,
    gap: 1,
  });

  const createPanel = (title: string, panelId: PanelId) => {
    const panel = new BoxRenderable(renderer, {
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: palette.panel,
      border: true,
      borderStyle: "single",
      borderColor: palette.border,
      padding: 1,
      gap: 1,
    });

    const heading = new BoxRenderable(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 1,
      flexShrink: 0,
    });

    const titleText = new TextRenderable(renderer, {
      content: title,
      fg: focusManager.isPanelActive(panelId) ? palette.accent : palette.active,
      attributes: TextAttributes.BOLD,
      wrapMode: "none",
      truncate: true,
    });

    const metaText = new TextRenderable(renderer, {
      content: "",
      fg: palette.muted,
      wrapMode: "none",
      truncate: true,
    });

    heading.add(titleText);
    heading.add(metaText);
    panel.add(heading);

    return { panel, titleText, metaText };
  };

  const {
    panel: manifestPanel,
    titleText: manifestPanelTitle,
    metaText: manifestPanelMeta,
  } = createPanel("Manifest", "manifest");

  const manifestList = new ScrollBoxRenderable(renderer, {
    id: "manifest-list",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
    viewportOptions: {
      paddingRight: 1,
    },
    contentOptions: {
      flexDirection: "column",
      gap: 0,
    },
    verticalScrollbarOptions: {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    },
  });
  manifestPanel.add(manifestList);

  let dockerPanel: BoxRenderable | null = null;
  let dockerPanelTitle: TextRenderable | null = null;
  let dockerPanelMeta: TextRenderable | null = null;
  let dockerList: ScrollBoxRenderable | null = null;

  if (hasDocker) {
    const panelParts = createPanel("Docker", "docker");
    dockerPanel = panelParts.panel;
    dockerPanelTitle = panelParts.titleText;
    dockerPanelMeta = panelParts.metaText;

    dockerList = new ScrollBoxRenderable(renderer, {
      id: "docker-list",
      flexGrow: 1,
      scrollY: true,
      scrollX: false,
      viewportOptions: {
        paddingRight: 1,
      },
      contentOptions: {
        flexDirection: "column",
        gap: 0,
      },
      verticalScrollbarOptions: {
        trackOptions: {
          backgroundColor: palette.element,
          foregroundColor: palette.border,
        },
      },
    });
    dockerPanel.add(dockerList);
  }

  const {
    panel: logPanel,
    titleText: logPanelTitle,
    metaText: logPanelMeta,
  } = createPanel("Logs", "logs");

  const logCode = new CodeRenderable(renderer, {
    id: "log-code",
    content: "",
    syntaxStyle: logStyle,
    flexGrow: 1,
    wrapMode: "char",
    drawUnstyledText: true,
    fg: palette.active,
    bg: palette.panel,
  });
  logPanel.add(logCode);

  sideColumn.add(manifestPanel);
  if (dockerPanel) {
    sideColumn.add(dockerPanel);
  }
  main.add(sideColumn);
  main.add(logPanel);

  const footer = new BoxRenderable(renderer, {
    flexShrink: 0,
    backgroundColor: palette.panel,
    border: ["top"],
    borderColor: palette.border,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    flexDirection: "column",
    gap: 1,
  });

  const footerState = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });

  const footerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 2,
    flexWrap: "wrap",
  });

  footer.add(footerState);
  footer.add(footerRow);

  let footerItems: TextRenderable[] = [];

  const compactShortcutLabels: Record<string, string> = {
    "switch panel": "switch",
    "next field": "next",
    follow: "tail",
  };

  const shortcutPriority: Record<string, number> = {
    start: 90,
    stop: 90,
    restart: 85,
    select: 80,
    scroll: 80,
    page: 75,
    clear: 75,
    follow: 78,
    add: 70,
    delete: 70,
    edit: 70,
    "switch panel": 95,
    quit: 100,
    confirm: 95,
    cancel: 95,
  };

  const shortcutLabel = (shortcut: Shortcut, labelMode: "full" | "compact"): string =>
    labelMode === "compact"
      ? (compactShortcutLabels[shortcut.label] ?? shortcut.label)
      : shortcut.label;

  const measureFooterWidth = (shortcuts: Shortcut[], labelMode: "full" | "compact"): number => {
    if (shortcuts.length === 0) return 0;
    return shortcuts.reduce((sum, shortcut) => {
      const label = shortcutLabel(shortcut, labelMode);
      return sum + shortcut.key.length + label.length + 1;
    }, 0);
  };

  const trimByPriority = (
    shortcuts: Shortcut[],
    labelMode: "full" | "compact",
    available: number,
  ): Shortcut[] => {
    const kept = [...shortcuts];
    while (kept.length > 1 && measureFooterWidth(kept, labelMode) > available) {
      let dropAt = kept.length - 1;
      let lowestPriority = Number.POSITIVE_INFINITY;
      for (let i = 0; i < kept.length; i += 1) {
        const shortcut = kept[i];
        if (!shortcut) continue;
        const priority = shortcutPriority[shortcut.label] ?? 50;
        if (priority <= lowestPriority) {
          lowestPriority = priority;
          dropAt = i;
        }
      }
      kept.splice(dropAt, 1);
    }
    return kept;
  };

  const getFooterLayout = () => {
    const shortcuts = focusManager.getShortcuts();
    const available = Math.max(0, renderer.width - 30);

    if (measureFooterWidth(shortcuts, "full") <= available) {
      return { shortcuts, labelMode: "full" as const };
    }

    if (measureFooterWidth(shortcuts, "compact") <= available) {
      return { shortcuts, labelMode: "compact" as const };
    }

    const fullTrimmed = trimByPriority(shortcuts, "full", available);
    if (measureFooterWidth(fullTrimmed, "full") <= available) {
      return { shortcuts: fullTrimmed, labelMode: "full" as const };
    }

    return {
      shortcuts: trimByPriority(shortcuts, "compact", available),
      labelMode: "compact" as const,
    };
  };

  const panelName = (panel: PanelId): string => {
    switch (panel) {
      case "manifest":
        return "manifest";
      case "docker":
        return "docker";
      case "logs":
        return "logs";
      default:
        return panel;
    }
  };

  const buildFooterState = (): string => {
    const mode = focusManager.getMode();
    if (mode === "editing") {
      return "editing service block  |  ctrl+s save  |  esc cancel";
    }

    if (mode === "adding") {
      return "adding service  |  enter confirm  |  tab next field  |  esc cancel";
    }

    const activePanel = focusManager.getActivePanel();
    const selectedManifest = manager.getSelectedView();
    const selectedDocker = dockerManager?.getSelectedService() ?? null;
    const activeLogName =
      logSource === "docker"
        ? (selectedDocker?.name ?? "docker")
        : (selectedManifest?.name ?? "service");
    const tailState = logsFollowTail ? "tail:on" : "tail:paused";
    const manifestState = selectedManifest?.state.toLowerCase() ?? "none";
    const dockerState = selectedDocker?.state ?? "none";

    return `panel:${panelName(activePanel)}  |  svc:${selectedManifest?.name ?? "-"} (${manifestState})  |  docker:${selectedDocker?.name ?? "-"} (${dockerState})  |  logs:${activeLogName} ${tailState}`;
  };

  const rebuildFooter = () => {
    for (const item of footerItems) {
      footerRow.remove(item.id);
      item.destroy();
    }
    footerItems = [];

    footerState.content = buildFooterState();

    const { shortcuts, labelMode } = getFooterLayout();
    shortcuts.forEach((shortcut, index) => {
      const keyText = new TextRenderable(renderer, {
        id: `footer-key-${index}`,
        content: shortcut.key,
        fg: palette.secondary,
      });
      footerRow.add(keyText);
      footerItems.push(keyText);

      const labelText = new TextRenderable(renderer, {
        id: `footer-label-${index}`,
        content: shortcutLabel(shortcut, labelMode),
        fg: palette.muted,
      });
      footerRow.add(labelText);
      footerItems.push(labelText);
    });
  };

  root.add(header);
  root.add(main);
  root.add(footer);

  const overlayBg = new BoxRenderable(renderer, {
    id: "overlay-bg",
    position: "absolute",
    width: "100%",
    height: "100%",
    visible: false,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.overlay,
    zIndex: 20,
  });

  const editOverlay = new BoxRenderable(renderer, {
    id: "edit-overlay",
    width: "72%",
    height: "68%",
    backgroundColor: palette.modal,
    border: true,
    borderStyle: "single",
    borderColor: palette.borderActive,
    flexDirection: "column",
    padding: 1,
    gap: 1,
    visible: false,
  });

  const editTitle = new TextRenderable(renderer, {
    content: "Edit service (ctrl+s save, esc cancel)",
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
  });
  editOverlay.add(editTitle);

  const editError = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
    wrapMode: "none",
    truncate: true,
  });
  editOverlay.add(editError);

  const editTextarea = new TextareaRenderable(renderer, {
    id: "edit-textarea",
    flexGrow: 1,
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.inputFocus,
    wrapMode: "char",
  });
  editOverlay.add(editTextarea);

  const addOverlay = new BoxRenderable(renderer, {
    id: "add-overlay",
    width: 60,
    backgroundColor: palette.modal,
    border: true,
    borderStyle: "single",
    borderColor: palette.borderActive,
    flexDirection: "column",
    padding: 1,
    gap: 1,
    visible: false,
  });

  const addTitle = new TextRenderable(renderer, {
    content: "Add service (enter confirm, tab next, esc cancel)",
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
  });
  addOverlay.add(addTitle);

  const addNameLabel = new TextRenderable(renderer, {
    content: "name",
    fg: palette.muted,
  });
  addOverlay.add(addNameLabel);

  const addNameField = new BoxRenderable(renderer, {
    width: "100%",
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingX: 1,
  });

  const addNameInput = new InputRenderable(renderer, {
    id: "add-name",
    placeholder: "service name",
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.inputFocus,
    width: "100%",
  });
  addNameField.add(addNameInput);
  addOverlay.add(addNameField);

  const addCommandLabel = new TextRenderable(renderer, {
    content: "command",
    fg: palette.muted,
  });
  addOverlay.add(addCommandLabel);

  const addCommandField = new BoxRenderable(renderer, {
    width: "100%",
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    backgroundColor: palette.input,
    paddingX: 1,
  });

  const addCommandInput = new InputRenderable(renderer, {
    id: "add-command",
    placeholder: "e.g. bun run dev",
    backgroundColor: palette.input,
    textColor: palette.active,
    focusedBackgroundColor: palette.inputFocus,
    width: "100%",
  });
  addCommandField.add(addCommandInput);
  addOverlay.add(addCommandField);

  const addError = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
    wrapMode: "none",
    truncate: true,
  });
  addOverlay.add(addError);

  const deleteOverlay = new BoxRenderable(renderer, {
    id: "delete-overlay",
    width: 56,
    backgroundColor: palette.modal,
    border: true,
    borderStyle: "single",
    borderColor: palette.red,
    flexDirection: "column",
    padding: 1,
    gap: 1,
    visible: false,
  });

  const deleteTitle = new TextRenderable(renderer, {
    content: "Delete service",
    fg: palette.red,
    attributes: TextAttributes.BOLD,
  });
  deleteOverlay.add(deleteTitle);

  const deleteMessage = new TextRenderable(renderer, {
    content: "Delete selected service? (y/n)",
    fg: palette.active,
  });
  deleteOverlay.add(deleteMessage);

  overlayBg.add(editOverlay);
  overlayBg.add(addOverlay);
  overlayBg.add(deleteOverlay);

  root.add(overlayBg);
  renderer.root.add(root);

  let listLines: TextRenderable[] = [];
  let dockerLines: TextRenderable[] = [];
  let logSource: "manifest" | "docker" = "manifest";
  let logsFollowTail = true;
  let lastLogVersion = -1;
  let lastSelectedIndex = -1;
  let lastLogSource: "manifest" | "docker" = "manifest";
  let addFocusField: "name" | "command" = "name";

  const panelTitleColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.accent : palette.active;

  const syncRows = (
    box: ScrollBoxRenderable,
    rows: TextRenderable[],
    desired: number,
    idPrefix: string,
  ): TextRenderable[] => {
    const nextRows = [...rows];

    while (nextRows.length < desired) {
      const line = new TextRenderable(renderer, {
        id: `${idPrefix}-${nextRows.length}`,
        content: "",
        fg: palette.muted,
        wrapMode: "none",
        truncate: true,
      });
      box.add(line);
      nextRows.push(line);
    }

    while (nextRows.length > desired) {
      const line = nextRows.pop();
      if (!line) break;
      box.remove(line.id);
      line.destroy();
    }

    return nextRows;
  };

  const applyAddFocusStyles = () => {
    addNameField.borderColor = addFocusField === "name" ? palette.borderActive : palette.border;
    addCommandField.borderColor =
      addFocusField === "command" ? palette.borderActive : palette.border;
  };

  const updateHeader = () => {
    const views = manager.getViews();
    const running = views.filter((view) => view.state === "RUNNING").length;
    const failed = views.filter((view) => view.state === "FAILED").length;

    if (!hasDocker || !dockerManager) {
      headerStatus.content = `${running}/${views.length} running${failed > 0 ? ` | ${failed} failed` : ""}`;
      return;
    }

    const dockerServices = dockerManager.getServices();
    const dockerRunning = dockerServices.filter((service) => service.state === "running").length;
    const dockerFailed = dockerServices.filter(
      (service) => service.state === "dead" || service.state === "exited",
    ).length;

    headerStatus.content = `${running}/${views.length} svc${
      failed > 0 ? ` | ${failed} failed` : ""
    } | ${dockerRunning}/${dockerServices.length} docker${
      dockerFailed > 0 ? ` | ${dockerFailed} stopped` : ""
    }`;
  };

  const rebuildList = (views: ServiceView[], selectedIndex: number) => {
    listLines = syncRows(manifestList, listLines, views.length, "service");
    const viewportWidth = Math.floor(manifestList.viewport.width);
    const rowWidth = Math.max(20, viewportWidth > 0 ? viewportWidth - 1 : 48);

    views.forEach((view, index) => {
      const selected = index === selectedIndex;
      const line = listLines[index];
      if (!line) return;
      line.content = formatManifestLine(view, selected, rowWidth);
      line.fg = selected ? palette.active : stateColor(view.state, palette);
    });

    manifestPanelMeta.content = `${views.filter((view) => view.state === "RUNNING").length}/${views.length} running`;
    ensureIndexVisible(manifestList, selectedIndex);
  };

  const rebuildDockerList = () => {
    if (!dockerManager || !dockerList || !dockerPanelMeta) return;

    const services = dockerManager.getServices();
    const selectedIdx = dockerManager.getSelectedIndex();
    dockerLines = syncRows(dockerList, dockerLines, services.length, "docker");

    const viewportWidth = Math.floor(dockerList.viewport.width);
    const rowWidth = Math.max(20, viewportWidth > 0 ? viewportWidth - 1 : 44);

    services.forEach((service, index) => {
      const selected = index === selectedIdx;
      const line = dockerLines[index];
      if (!line) return;
      line.content = formatDockerLine(service, selected, rowWidth);
      line.fg = selected ? palette.active : dockerStateColor(service.state, palette);
    });

    dockerPanelMeta.content = `${services.filter((service) => service.state === "running").length}/${
      services.length
    } running`;
    ensureIndexVisible(dockerList, selectedIdx);
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

    const switchedTarget = selectedIndex !== lastSelectedIndex || source !== lastLogSource;
    const pinnedBottom = logCode.maxScrollY - logCode.scrollY <= 1;

    lastLogVersion = version;
    lastSelectedIndex = selectedIndex;
    lastLogSource = source;

    logCode.content = buffer ? buffer.getFullText() : "";
    if (switchedTarget || logsFollowTail || pinnedBottom) {
      logCode.scrollY = logCode.maxScrollY;
    }

    if (source === "docker") {
      const selected = dockerManager?.getSelectedService();
      const scroll =
        logCode.maxScrollY === 0 ? 100 : Math.round((logCode.scrollY / logCode.maxScrollY) * 100);
      logPanelMeta.content = `${selected?.name ?? "docker"}  lines:${buffer?.size() ?? 0}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
      return;
    }

    const selected = manager.getSelectedView();
    const scroll =
      logCode.maxScrollY === 0 ? 100 : Math.round((logCode.scrollY / logCode.maxScrollY) * 100);
    logPanelMeta.content = `${selected?.name ?? "service"}  lines:${buffer?.size() ?? 0}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
  };

  const updatePanelStyles = () => {
    const manifestActive = focusManager.isPanelActive("manifest");
    manifestPanelTitle.content = `${manifestActive ? "*" : "o"} Manifest`;
    manifestPanelTitle.fg = panelTitleColor("manifest");
    manifestPanel.borderColor = manifestActive ? palette.borderActive : palette.border;
    manifestPanel.borderStyle = manifestActive ? "double" : "single";

    const logActive = focusManager.isPanelActive("logs");
    logPanelTitle.content = `${logActive ? "*" : "o"} Logs`;
    logPanelTitle.fg = panelTitleColor("logs");
    logPanel.borderColor = logActive ? palette.borderActive : palette.border;
    logPanel.borderStyle = logActive ? "double" : "single";

    if (dockerPanel && dockerPanelTitle) {
      const dockerActive = focusManager.isPanelActive("docker");
      dockerPanelTitle.content = `${dockerActive ? "*" : "o"} Docker`;
      dockerPanelTitle.fg = panelTitleColor("docker");
      dockerPanel.borderColor = dockerActive ? palette.borderActive : palette.border;
      dockerPanel.borderStyle = dockerActive ? "double" : "single";
    }
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
    rebuildDockerList();
    rebuildLogs();
    updateHeader();
    updatePanelStyles();
    rebuildFooter();

    renderer.requestRender();
  };

  const applyLayout = () => {
    const stacked = renderer.width < 112;
    main.flexDirection = stacked ? "column" : "row";

    if (stacked) {
      sideColumn.width = "100%";
      sideColumn.height = hasDocker
        ? Math.max(12, Math.floor(renderer.height * 0.35))
        : Math.max(10, Math.floor(renderer.height * 0.28));
      manifestPanel.flexGrow = 1;

      if (dockerPanel) {
        dockerPanel.flexGrow = 1;
      }

      logPanel.flexGrow = 1;
    } else {
      const sideWidth = hasDocker
        ? clamp(Math.floor(renderer.width * 0.34), 36, 52)
        : clamp(Math.floor(renderer.width * 0.38), 34, 58);

      sideColumn.width = sideWidth;
      sideColumn.height = "auto";
      manifestPanel.flexGrow = hasDocker ? 2 : 1;

      if (dockerPanel) {
        dockerPanel.flexGrow = 1;
      }

      logPanel.flexGrow = 1;
    }

    const compactOverlay = renderer.width < 120;
    editOverlay.width = compactOverlay ? "94%" : "72%";
    editOverlay.height = compactOverlay ? "82%" : "68%";
    addOverlay.width = compactOverlay ? "92%" : 60;
    deleteOverlay.width = compactOverlay ? "88%" : 56;

    renderAll();
  };

  const applyTheme = () => {
    palette = getTheme(renderer.themeMode);

    root.backgroundColor = palette.bg;

    header.backgroundColor = palette.panel;
    header.borderColor = palette.border;
    headerTitle.fg = palette.active;
    headerPath.fg = palette.muted;
    headerVersion.fg = palette.active;
    headerStatus.fg = palette.muted;

    manifestPanel.backgroundColor = palette.panel;
    manifestPanel.borderColor = palette.border;
    manifestPanelMeta.fg = palette.muted;
    manifestList.verticalScrollbarOptions = {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    };

    if (dockerPanel && dockerPanelMeta && dockerList) {
      dockerPanel.backgroundColor = palette.panel;
      dockerPanel.borderColor = palette.border;
      dockerPanelMeta.fg = palette.muted;
      dockerList.verticalScrollbarOptions = {
        trackOptions: {
          backgroundColor: palette.element,
          foregroundColor: palette.border,
        },
      };
    }

    logPanel.backgroundColor = palette.panel;
    logPanel.borderColor = palette.border;
    logPanelMeta.fg = palette.muted;
    logCode.fg = palette.active;
    logCode.bg = palette.panel;

    footer.backgroundColor = palette.panel;
    footer.borderColor = palette.border;
    footerState.fg = palette.muted;

    overlayBg.backgroundColor = palette.overlay;

    editOverlay.backgroundColor = palette.modal;
    editOverlay.borderColor = palette.borderActive;
    editTitle.fg = palette.accent;
    editError.fg = palette.red;
    editTextarea.backgroundColor = palette.input;
    editTextarea.textColor = palette.active;
    editTextarea.focusedBackgroundColor = palette.inputFocus;

    addOverlay.backgroundColor = palette.modal;
    addOverlay.borderColor = palette.borderActive;
    addTitle.fg = palette.accent;
    addNameLabel.fg = palette.muted;
    addCommandLabel.fg = palette.muted;
    addError.fg = palette.red;
    addNameField.backgroundColor = palette.input;
    addNameInput.backgroundColor = palette.input;
    addNameInput.textColor = palette.active;
    addNameInput.focusedBackgroundColor = palette.inputFocus;
    addCommandField.backgroundColor = palette.input;
    addCommandInput.backgroundColor = palette.input;
    addCommandInput.textColor = palette.active;
    addCommandInput.focusedBackgroundColor = palette.inputFocus;
    applyAddFocusStyles();

    deleteOverlay.backgroundColor = palette.modal;
    deleteOverlay.borderColor = palette.red;
    deleteTitle.fg = palette.red;
    deleteMessage.fg = palette.active;

    lastLogVersion = -1;
    lastSelectedIndex = -1;
    renderAll();
  };

  renderer.on("resize", applyLayout);
  renderer.on("theme_mode", applyTheme);

  applyAddFocusStyles();
  applyLayout();

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
      applyAddFocusStyles();
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
      applyAddFocusStyles();
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
      logsFollowTail = next >= logCode.maxScrollY;
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsPage(deltaPages: number) {
      const pageSize = Math.max(1, Math.floor(logCode.height) - 1);
      const next = Math.max(
        0,
        Math.min(logCode.scrollY + pageSize * deltaPages, logCode.maxScrollY),
      );
      logCode.scrollY = next;
      logsFollowTail = next >= logCode.maxScrollY;
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsToTop() {
      logCode.scrollY = 0;
      logsFollowTail = false;
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsToBottom() {
      logCode.scrollY = logCode.maxScrollY;
      logsFollowTail = true;
      renderer.requestRender();
      rebuildFooter();
    },

    toggleLogsFollowTail() {
      logsFollowTail = !logsFollowTail;
      if (logsFollowTail) {
        logCode.scrollY = logCode.maxScrollY;
      }
      renderAll();
      return logsFollowTail;
    },

    setLogsFollowTail(enabled: boolean) {
      logsFollowTail = enabled;
      if (logsFollowTail) {
        logCode.scrollY = logCode.maxScrollY;
      }
      renderAll();
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
