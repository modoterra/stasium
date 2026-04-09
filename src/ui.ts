import {
  BoxRenderable,
  type CliRenderer,
  InputRenderable,
  RGBA,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  TextareaRenderable,
} from "@opentui/core";
import type { DiscoverySelection, SelectionItem } from "./discovery";
import type { DockerManager } from "./docker";
import type { FocusManager } from "./focus";
import type { ServiceManager, ServiceView } from "./service-manager";
import { formatCommandSpec } from "./shared";
import type { DockerService, LogEntry, Manifest, PanelId, Shortcut } from "./types";

interface Palette {
  active: string;
  muted: string;
  panel: string;
  panelActive: string;
  selection: string;
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
  panel: "#161616",
  panelActive: "#222222",
  selection: "#2c2c2c",
  element: "#1d1d1d",
  accent: "#fab283",
  secondary: "#5c9cf5",
  amber: "#f5a742",
  green: "#7fd88f",
  red: "#e06c75",
  bg: "transparent",
  border: "#484848",
  borderActive: "#606060",
  overlay: RGBA.fromInts(0, 0, 0, 0),
  modal: "#141414",
  input: "#1e1e1e",
  inputFocus: "#282828",
};

const light: Palette = {
  active: "#1a1a1a",
  muted: "#8a8a8a",
  panel: "#ececec",
  panelActive: "#dfdfdf",
  selection: "#d4d4d4",
  element: "#e4e4e4",
  accent: "#3b7dd8",
  secondary: "#7b5bb6",
  amber: "#d68c27",
  green: "#3d9a57",
  red: "#d1383d",
  bg: "transparent",
  border: "#b8b8b8",
  borderActive: "#a0a0a0",
  overlay: RGBA.fromInts(0, 0, 0, 0),
  modal: "#ffffff",
  input: "#ffffff",
  inputFocus: "#f5f5f5",
};

const getTheme = (mode: "dark" | "light" | null): Palette => (mode === "light" ? light : dark);
const VERSION_LABEL = "Stasium v0.2.3 (32423)";
const APP_INSET_X = 2;
const APP_INSET_Y = 1;
const PANEL_GAP_X = 2;
const PANEL_GAP_Y = 1;
const PANEL_PADDING_X = 2;
const PANEL_PADDING_Y = 1;
const PANEL_CONTENT_GAP_Y = 1;
const INLINE_GAP_X = 2;
const INLINE_GAP_Y = 1;
const COMPACT_GAP = 0;
const INPUT_PADDING_X = 1;
const SCROLLBAR_PADDING_RIGHT = 1;
const LOG_ROW_GAP_X = 1;
const LOG_TIMESTAMP_WIDTH = 8;
const LOG_STREAM_WIDTH = 3;
const LOG_MIN_MESSAGE_WIDTH = 4;
const MIN_LOG_PANEL_WIDTH = 56;
const MIN_APP_WIDTH = 80;
const MIN_APP_HEIGHT_WITH_DOCKER = 35;
const MIN_APP_HEIGHT_NO_DOCKER = 28;

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

const getScrollBoxMaxTop = (box: ScrollBoxRenderable): number =>
  Math.max(0, box.scrollHeight - Math.max(1, Math.floor(box.viewport.height)));

const formatLogTimestamp = (value: string): string => {
  const time = value.slice(11, 19);
  return time.length === LOG_TIMESTAMP_WIDTH ? time : truncateText(value, LOG_TIMESTAMP_WIDTH);
};

const formatLogStream = (stream: LogEntry["stream"]): string =>
  stream === "stderr" ? "ERR" : "OUT";

const truncateLogMessage = (value: string, max: number): { text: string; hidden: number } => {
  if (max <= 0) return { text: "", hidden: value.length };
  if (value.length <= max) return { text: value, hidden: 0 };
  if (max <= 3) return { text: value.slice(0, max), hidden: value.length - max };

  const visibleChars = max - 3;
  return {
    text: `${value.slice(0, visibleChars)}...`,
    hidden: value.length - visibleChars,
  };
};

interface LogRowRenderable {
  box: BoxRenderable;
  timestamp: TextRenderable;
  stream: TextRenderable;
  message: TextRenderable;
  meta: TextRenderable;
}

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
  showDiscoveryOverlay: (selection: DiscoverySelection, warnings: string[]) => void;
  hideDiscoveryOverlay: () => void;
  setDiscoveryError: (message: string) => void;
  clearDiscoveryError: () => void;
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

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    backgroundColor: palette.bg,
    flexDirection: "column",
    paddingTop: APP_INSET_Y,
    paddingBottom: APP_INSET_Y,
    paddingLeft: APP_INSET_X,
    paddingRight: APP_INSET_X,
    rowGap: PANEL_GAP_Y,
  });

  const header = new BoxRenderable(renderer, {
    flexShrink: 0,
    width: "100%",
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: INLINE_GAP_X,
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
    gap: COMPACT_GAP,
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
    flexDirection: "row",
    columnGap: PANEL_GAP_X,
    rowGap: PANEL_GAP_Y,
  });

  const sideColumn = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexShrink: 0,
    rowGap: PANEL_GAP_Y,
  });

  const createPanel = (title: string, panelId: PanelId) => {
    const panel = new BoxRenderable(renderer, {
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: palette.panel,
      paddingTop: PANEL_PADDING_Y,
      paddingBottom: PANEL_PADDING_Y,
      paddingLeft: PANEL_PADDING_X,
      paddingRight: PANEL_PADDING_X,
      rowGap: PANEL_CONTENT_GAP_Y,
    });

    const heading = new BoxRenderable(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      columnGap: INLINE_GAP_X,
      flexShrink: 0,
    });

    const titleText = new TextRenderable(renderer, {
      content: title,
      fg: focusManager.isPanelActive(panelId) ? palette.accent : palette.muted,
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
      paddingRight: SCROLLBAR_PADDING_RIGHT,
    },
    contentOptions: {
      flexDirection: "column",
      gap: COMPACT_GAP,
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
        paddingRight: SCROLLBAR_PADDING_RIGHT,
      },
      contentOptions: {
        flexDirection: "column",
        gap: COMPACT_GAP,
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

  const logList = new ScrollBoxRenderable(renderer, {
    id: "log-list",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
    viewportOptions: {
      paddingRight: SCROLLBAR_PADDING_RIGHT,
    },
    contentOptions: {
      flexDirection: "column",
      gap: COMPACT_GAP,
    },
    verticalScrollbarOptions: {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    },
  });
  logPanel.add(logList);

  sideColumn.add(manifestPanel);
  if (dockerPanel) {
    sideColumn.add(dockerPanel);
  }
  main.add(sideColumn);
  main.add(logPanel);

  const footerStack = new BoxRenderable(renderer, {
    flexShrink: 0,
    flexDirection: "column",
    width: "100%",
    rowGap: PANEL_GAP_Y,
  });

  const footerStatePanel = new BoxRenderable(renderer, {
    flexShrink: 0,
    width: "100%",
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
  });

  const footerShortcutsPanel = new BoxRenderable(renderer, {
    flexShrink: 0,
    width: "100%",
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
  });

  const footerStateRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    columnGap: INLINE_GAP_X,
    rowGap: INLINE_GAP_Y,
    flexWrap: "wrap",
  });

  const footerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    columnGap: INLINE_GAP_X,
    rowGap: INLINE_GAP_Y,
    flexWrap: "wrap",
  });

  footerStatePanel.add(footerStateRow);
  footerShortcutsPanel.add(footerRow);
  footerStack.add(footerStatePanel);
  footerStack.add(footerShortcutsPanel);

  let footerStateItems: TextRenderable[] = [];
  let footerItems: TextRenderable[] = [];

  const compactShortcutLabels: Record<string, string> = {
    "switch panel": "switch",
    "next field": "next",
    follow: "tail",
    discover: "scan",
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
    discover: 72,
    delete: 70,
    edit: 70,
    move: 85,
    toggle: 85,
    all: 75,
    none: 75,
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
    const shortcuts = logsPanelVisible
      ? focusManager.getShortcuts()
      : focusManager
          .getShortcuts()
          .filter((shortcut) => shortcut.label !== "log page" && shortcut.label !== "log jump");
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

  const buildFooterState = (): Array<{ content: string; fg: string }> => {
    const mode = focusManager.getMode();
    if (mode === "editing") {
      return [
        { content: "editing service block", fg: palette.accent },
        { content: "ctrl+s save", fg: palette.secondary },
        { content: "esc cancel", fg: palette.muted },
      ];
    }

    if (mode === "adding") {
      return [
        { content: "adding service", fg: palette.accent },
        { content: "enter confirm", fg: palette.secondary },
        { content: "tab next field", fg: palette.muted },
        { content: "esc cancel", fg: palette.muted },
      ];
    }

    if (mode === "discovering") {
      return [
        { content: "discovering services", fg: palette.accent },
        { content: "up/down move", fg: palette.secondary },
        { content: "space toggle", fg: palette.muted },
        { content: "enter add selected", fg: palette.secondary },
        { content: "esc cancel", fg: palette.muted },
      ];
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

    return [
      { content: `panel:${panelName(activePanel)}`, fg: panelTitleColor(activePanel) },
      {
        content: `svc:${selectedManifest?.name ?? "-"} (${manifestState})`,
        fg: selectedManifest ? stateColor(selectedManifest.state, palette) : palette.muted,
      },
      {
        content: `docker:${selectedDocker?.name ?? "-"} (${dockerState})`,
        fg: selectedDocker ? dockerStateColor(selectedDocker.state, palette) : palette.muted,
      },
      {
        content: logsPanelVisible ? `logs:${activeLogName} ${tailState}` : "logs:hidden",
        fg: logsPanelVisible ? (logsFollowTail ? palette.secondary : palette.muted) : palette.muted,
      },
    ];
  };

  const rebuildFooter = () => {
    for (const item of footerStateItems) {
      footerStateRow.remove(item.id);
      item.destroy();
    }
    footerStateItems = [];

    for (const item of footerItems) {
      footerRow.remove(item.id);
      item.destroy();
    }
    footerItems = [];

    buildFooterState().forEach((segment, index) => {
      const item = new TextRenderable(renderer, {
        id: `footer-state-${index}`,
        content: segment.content,
        fg: segment.fg,
        wrapMode: "none",
        truncate: true,
      });
      footerStateRow.add(item);
      footerStateItems.push(item);
    });

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
  root.add(footerStack);

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
    flexDirection: "column",
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    rowGap: PANEL_CONTENT_GAP_Y,
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
    flexDirection: "column",
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    rowGap: PANEL_CONTENT_GAP_Y,
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
    backgroundColor: palette.input,
    paddingX: INPUT_PADDING_X,
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
    backgroundColor: palette.input,
    paddingX: INPUT_PADDING_X,
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

  const discoveryOverlay = new BoxRenderable(renderer, {
    id: "discovery-overlay",
    width: 78,
    backgroundColor: palette.modal,
    flexDirection: "column",
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    rowGap: PANEL_CONTENT_GAP_Y,
    visible: false,
  });

  const discoveryTitle = new TextRenderable(renderer, {
    content: "Discover services (enter add, space toggle, esc cancel)",
    fg: palette.accent,
    attributes: TextAttributes.BOLD,
    wrapMode: "none",
    truncate: true,
  });
  discoveryOverlay.add(discoveryTitle);

  const discoverySummary = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });
  discoveryOverlay.add(discoverySummary);

  const discoverySelectionContainer = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: COMPACT_GAP,
  });
  discoveryOverlay.add(discoverySelectionContainer);

  const discoveryWarningTitle = new TextRenderable(renderer, {
    content: "",
    fg: palette.amber,
    wrapMode: "none",
    truncate: true,
  });
  discoveryOverlay.add(discoveryWarningTitle);

  const discoveryWarningContainer = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: COMPACT_GAP,
  });
  discoveryOverlay.add(discoveryWarningContainer);

  const discoveryError = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
    wrapMode: "none",
    truncate: true,
  });
  discoveryOverlay.add(discoveryError);

  const deleteOverlay = new BoxRenderable(renderer, {
    id: "delete-overlay",
    width: 56,
    backgroundColor: palette.modal,
    flexDirection: "column",
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    rowGap: PANEL_CONTENT_GAP_Y,
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

  const tooSmallOverlay = new BoxRenderable(renderer, {
    id: "too-small-overlay",
    position: "absolute",
    width: "100%",
    height: "100%",
    visible: false,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: palette.bg,
  });

  const tooSmallCard = new BoxRenderable(renderer, {
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y + 1,
    paddingBottom: PANEL_PADDING_Y + 1,
    paddingLeft: PANEL_PADDING_X + 1,
    paddingRight: PANEL_PADDING_X + 1,
    flexDirection: "column",
    alignItems: "center",
    rowGap: PANEL_CONTENT_GAP_Y,
  });

  const tooSmallTitle = new TextRenderable(renderer, {
    content: "Terminal size too small",
    fg: palette.active,
    attributes: TextAttributes.BOLD,
  });
  tooSmallCard.add(tooSmallTitle);

  const tooSmallCurrentLabel = new TextRenderable(renderer, {
    content: "Current size:",
    fg: palette.muted,
  });
  tooSmallCard.add(tooSmallCurrentLabel);

  const tooSmallCurrentRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    columnGap: INLINE_GAP_X,
    alignItems: "center",
  });
  const tooSmallCurrentWidthLabel = new TextRenderable(renderer, {
    content: "Width =",
    fg: palette.muted,
  });
  const tooSmallCurrentWidthValue = new TextRenderable(renderer, {
    content: "0",
    fg: palette.green,
  });
  const tooSmallCurrentHeightLabel = new TextRenderable(renderer, {
    content: "Height =",
    fg: palette.muted,
  });
  const tooSmallCurrentHeightValue = new TextRenderable(renderer, {
    content: "0",
    fg: palette.green,
  });
  tooSmallCurrentRow.add(tooSmallCurrentWidthLabel);
  tooSmallCurrentRow.add(tooSmallCurrentWidthValue);
  tooSmallCurrentRow.add(tooSmallCurrentHeightLabel);
  tooSmallCurrentRow.add(tooSmallCurrentHeightValue);
  tooSmallCard.add(tooSmallCurrentRow);

  const tooSmallRequiredLabel = new TextRenderable(renderer, {
    content: "Needed for current config:",
    fg: palette.muted,
  });
  tooSmallCard.add(tooSmallRequiredLabel);

  const tooSmallRequiredRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    columnGap: INLINE_GAP_X,
    alignItems: "center",
  });
  const tooSmallRequiredWidthLabel = new TextRenderable(renderer, {
    content: "Width =",
    fg: palette.muted,
  });
  const tooSmallRequiredWidthValue = new TextRenderable(renderer, {
    content: String(MIN_APP_WIDTH),
    fg: palette.green,
  });
  const tooSmallRequiredHeightLabel = new TextRenderable(renderer, {
    content: "Height =",
    fg: palette.muted,
  });
  const tooSmallRequiredHeightValue = new TextRenderable(renderer, {
    content: "0",
    fg: palette.green,
  });
  tooSmallRequiredRow.add(tooSmallRequiredWidthLabel);
  tooSmallRequiredRow.add(tooSmallRequiredWidthValue);
  tooSmallRequiredRow.add(tooSmallRequiredHeightLabel);
  tooSmallRequiredRow.add(tooSmallRequiredHeightValue);
  tooSmallCard.add(tooSmallRequiredRow);

  tooSmallOverlay.add(tooSmallCard);

  overlayBg.add(editOverlay);
  overlayBg.add(addOverlay);
  overlayBg.add(discoveryOverlay);
  overlayBg.add(deleteOverlay);

  root.add(overlayBg);
  root.add(tooSmallOverlay);
  renderer.root.add(root);

  let listLines: TextRenderable[] = [];
  let dockerLines: TextRenderable[] = [];
  let logLines: LogRowRenderable[] = [];
  let logSource: "manifest" | "docker" = "manifest";
  let logsPanelVisible = true;
  let logsFollowTail = true;
  let lastLogVersion = -1;
  let lastSelectedIndex = -1;
  let lastLogSource: "manifest" | "docker" = "manifest";
  let addFocusField: "name" | "command" = "name";
  let discoverySelection: DiscoverySelection | null = null;
  let discoveryWarnings: string[] = [];
  let discoverySelectionLines: TextRenderable[] = [];
  let discoveryWarningLines: TextRenderable[] = [];
  let unsubDiscoverySelection: (() => void) | null = null;

  const panelTitleColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.accent : palette.muted;

  const panelBackgroundColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.panelActive : palette.panel;

  const listSelectionBackground = (): string => palette.selection;

  const focusWhenVisible = (target: BoxRenderable, focus: () => void): void => {
    queueMicrotask(() => {
      if (!target.visible) return;
      focus();
      renderer.requestRender();
    });
  };

  const updateTooSmallState = (): boolean => {
    const minHeight = hasDocker ? MIN_APP_HEIGHT_WITH_DOCKER : MIN_APP_HEIGHT_NO_DOCKER;
    const tooSmall = renderer.width < MIN_APP_WIDTH || renderer.height < minHeight;
    const modalVisible =
      editOverlay.visible ||
      addOverlay.visible ||
      discoveryOverlay.visible ||
      deleteOverlay.visible;

    tooSmallOverlay.visible = tooSmall;
    header.visible = !tooSmall;
    main.visible = !tooSmall;
    footerStack.visible = !tooSmall;
    overlayBg.visible = !tooSmall && modalVisible;
    tooSmallOverlay.backgroundColor = palette.bg;
    tooSmallCard.backgroundColor = palette.panel;
    tooSmallTitle.fg = palette.active;
    tooSmallCurrentLabel.fg = palette.muted;
    tooSmallCurrentWidthLabel.fg = palette.muted;
    tooSmallCurrentWidthValue.content = String(renderer.width);
    tooSmallCurrentWidthValue.fg = renderer.width >= MIN_APP_WIDTH ? palette.green : palette.red;
    tooSmallCurrentHeightLabel.fg = palette.muted;
    tooSmallCurrentHeightValue.content = String(renderer.height);
    tooSmallCurrentHeightValue.fg = renderer.height >= minHeight ? palette.green : palette.red;
    tooSmallRequiredLabel.fg = palette.muted;
    tooSmallRequiredWidthLabel.fg = palette.muted;
    tooSmallRequiredWidthValue.content = String(MIN_APP_WIDTH);
    tooSmallRequiredWidthValue.fg = palette.green;
    tooSmallRequiredHeightLabel.fg = palette.muted;
    tooSmallRequiredHeightValue.content = String(minHeight);
    tooSmallRequiredHeightValue.fg = palette.green;

    return tooSmall;
  };

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
        width: "100%",
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

  const syncLogRows = (desired: number): LogRowRenderable[] => {
    const nextRows = [...logLines];

    while (nextRows.length < desired) {
      const index = nextRows.length;
      const box = new BoxRenderable(renderer, {
        id: `log-row-${index}`,
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        columnGap: LOG_ROW_GAP_X,
        backgroundColor: panelBackgroundColor("logs"),
      });

      const timestamp = new TextRenderable(renderer, {
        id: `log-row-ts-${index}`,
        width: LOG_TIMESTAMP_WIDTH,
        fg: palette.muted,
        wrapMode: "none",
        truncate: true,
      });

      const stream = new TextRenderable(renderer, {
        id: `log-row-stream-${index}`,
        width: LOG_STREAM_WIDTH,
        attributes: TextAttributes.BOLD,
        wrapMode: "none",
        truncate: true,
      });

      const message = new TextRenderable(renderer, {
        id: `log-row-message-${index}`,
        flexGrow: 1,
        minWidth: 0,
        fg: palette.active,
        wrapMode: "none",
        truncate: true,
      });

      const meta = new TextRenderable(renderer, {
        id: `log-row-meta-${index}`,
        fg: palette.muted,
        wrapMode: "none",
        truncate: true,
      });

      box.add(timestamp);
      box.add(stream);
      box.add(message);
      box.add(meta);
      logList.add(box);
      nextRows.push({ box, timestamp, stream, message, meta });
    }

    while (nextRows.length > desired) {
      const row = nextRows.pop();
      if (!row) break;
      logList.remove(row.box.id);
      row.box.destroy();
    }

    return nextRows;
  };

  const applyAddFocusStyles = () => {
    addNameField.backgroundColor = addFocusField === "name" ? palette.inputFocus : palette.input;
    addCommandField.backgroundColor =
      addFocusField === "command" ? palette.inputFocus : palette.input;
  };

  const clearDiscoverySelectionLines = () => {
    for (const line of discoverySelectionLines) {
      discoverySelectionContainer.remove(line.id);
      line.destroy();
    }
    discoverySelectionLines = [];
  };

  const clearDiscoveryWarningLines = () => {
    for (const line of discoveryWarningLines) {
      discoveryWarningContainer.remove(line.id);
      line.destroy();
    }
    discoveryWarningLines = [];
  };

  const rebuildDiscoverySelection = () => {
    clearDiscoverySelectionLines();

    if (!discoverySelection) {
      discoverySummary.content = "No discovery session.";
      return;
    }

    const items = discoverySelection.getItems();
    const total = items.length;
    const selectedCount = discoverySelection.getSelectedCount();

    discoverySummary.content =
      total === 0
        ? "No services detected in this workspace."
        : `Detected ${total} service${total === 1 ? "" : "s"} (${selectedCount} selected)`;

    const cursor = discoverySelection.getCursor();
    items.forEach((item, index) => {
      const active = index === cursor;
      const line = new TextRenderable(renderer, {
        id: `discovery-selection-${index}`,
        content: formatInitSelectionLine(item, active),
        fg: active ? palette.accent : item.selected ? palette.green : palette.muted,
        wrapMode: "none",
        truncate: true,
      });
      discoverySelectionContainer.add(line);
      discoverySelectionLines.push(line);
    });
  };

  const rebuildDiscoveryWarnings = () => {
    clearDiscoveryWarningLines();

    if (discoveryWarnings.length === 0) {
      discoveryWarningTitle.content = "";
      return;
    }

    discoveryWarningTitle.content = "Warnings:";
    discoveryWarnings.forEach((warning, index) => {
      const line = new TextRenderable(renderer, {
        id: `discovery-warning-${index}`,
        content: `- ${warning}`,
        fg: palette.amber,
        wrapMode: "none",
        truncate: true,
      });
      discoveryWarningContainer.add(line);
      discoveryWarningLines.push(line);
    });
  };

  const renderDiscoveryOverlay = () => {
    rebuildDiscoverySelection();
    rebuildDiscoveryWarnings();
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
      line.bg = selected ? listSelectionBackground() : panelBackgroundColor("manifest");
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
      line.bg = selected ? listSelectionBackground() : panelBackgroundColor("docker");
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
    const pinnedBottom = getScrollBoxMaxTop(logList) - logList.scrollTop <= 1;
    const previousScrollTop = logList.scrollTop;

    lastLogVersion = version;
    lastSelectedIndex = selectedIndex;
    lastLogSource = source;

    const entries = buffer?.all() ?? [];
    logLines = syncLogRows(entries.length);

    const viewportWidth = Math.floor(logList.viewport.width);
    const rowWidth = Math.max(24, viewportWidth > 0 ? viewportWidth - 1 : 64);

    entries.forEach((entry, index) => {
      const row = logLines[index];
      if (!row) return;

      const metaBase = `#${index + 1}`;
      const reservedWidth =
        LOG_TIMESTAMP_WIDTH + LOG_STREAM_WIDTH + metaBase.length + LOG_ROW_GAP_X * 3;
      const messageWidth = Math.max(LOG_MIN_MESSAGE_WIDTH, rowWidth - reservedWidth);
      const truncated = truncateLogMessage(entry.line, messageWidth);
      const metaText = truncated.hidden > 0 ? `${metaBase} +${truncated.hidden} cols` : metaBase;

      row.box.backgroundColor = panelBackgroundColor("logs");
      row.timestamp.content = formatLogTimestamp(entry.timestamp);
      row.timestamp.fg = palette.muted;
      row.stream.content = formatLogStream(entry.stream);
      row.stream.fg = entry.stream === "stderr" ? palette.red : palette.secondary;
      row.message.content = truncated.text;
      row.message.fg = entry.stream === "stderr" ? palette.red : palette.active;
      row.meta.content = metaText;
      row.meta.fg = truncated.hidden > 0 ? palette.amber : palette.muted;
    });

    if (switchedTarget || logsFollowTail || pinnedBottom) {
      logList.scrollTop = getScrollBoxMaxTop(logList);
    } else {
      logList.scrollTop = Math.min(previousScrollTop, getScrollBoxMaxTop(logList));
    }

    const visibleStart = entries.length === 0 ? 0 : Math.min(entries.length, logList.scrollTop + 1);
    const visibleEnd =
      entries.length === 0
        ? 0
        : Math.min(
            entries.length,
            visibleStart + Math.max(0, Math.floor(logList.viewport.height) - 1),
          );
    const maxTop = getScrollBoxMaxTop(logList);
    const scroll = maxTop === 0 ? 100 : Math.round((logList.scrollTop / maxTop) * 100);

    if (source === "docker") {
      const selected = dockerManager?.getSelectedService();
      logPanelMeta.content = `${selected?.name ?? "docker"}  lines:${entries.length}  show:${visibleStart}-${visibleEnd}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
      return;
    }

    const selected = manager.getSelectedView();
    logPanelMeta.content = `${selected?.name ?? "service"}  lines:${entries.length}  show:${visibleStart}-${visibleEnd}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
  };

  const updatePanelStyles = () => {
    manifestPanelTitle.content = "Manifest";
    manifestPanelTitle.fg = panelTitleColor("manifest");
    manifestPanel.backgroundColor = panelBackgroundColor("manifest");

    logPanelTitle.content = "Logs";
    logPanelTitle.fg = panelTitleColor("logs");
    logPanel.backgroundColor = panelBackgroundColor("logs");
    for (const row of logLines) {
      row.box.backgroundColor = panelBackgroundColor("logs");
    }

    if (dockerPanel && dockerPanelTitle) {
      dockerPanelTitle.content = "Docker";
      dockerPanelTitle.fg = panelTitleColor("docker");
      dockerPanel.backgroundColor = panelBackgroundColor("docker");
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
    updateTooSmallState();

    const stacked = renderer.width < 112;
    const sideWidth = hasDocker
      ? clamp(Math.floor(renderer.width * 0.34), 36, 52)
      : clamp(Math.floor(renderer.width * 0.38), 34, 58);
    const nextLogsPanelVisible =
      (stacked
        ? renderer.width - APP_INSET_X * 2
        : renderer.width - APP_INSET_X * 2 - sideWidth - PANEL_GAP_X) >= MIN_LOG_PANEL_WIDTH;

    logsPanelVisible = nextLogsPanelVisible;
    main.flexDirection = stacked || !logsPanelVisible ? "column" : "row";
    logPanel.visible = logsPanelVisible;

    if (!logsPanelVisible && focusManager.getActivePanel() === "logs") {
      focusManager.setActivePanel("manifest");
    }

    if (stacked || !logsPanelVisible) {
      sideColumn.width = "100%";
      sideColumn.height = logsPanelVisible
        ? hasDocker
          ? Math.max(12, Math.floor(renderer.height * 0.35))
          : Math.max(10, Math.floor(renderer.height * 0.28))
        : "auto";
      sideColumn.flexGrow = logsPanelVisible ? 0 : 1;
      manifestPanel.flexGrow = 1;

      if (dockerPanel) {
        dockerPanel.flexGrow = 1;
      }

      logPanel.flexGrow = 1;
    } else {
      sideColumn.width = sideWidth;
      sideColumn.height = "auto";
      sideColumn.flexGrow = 0;
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
    discoveryOverlay.width = compactOverlay ? "94%" : 78;
    deleteOverlay.width = compactOverlay ? "88%" : 56;

    renderAll();
  };

  const applyTheme = () => {
    palette = getTheme(renderer.themeMode);
    updateTooSmallState();

    root.backgroundColor = palette.bg;

    header.backgroundColor = palette.panel;
    headerTitle.fg = palette.active;
    headerPath.fg = palette.muted;
    headerVersion.fg = palette.active;
    headerStatus.fg = palette.muted;

    manifestPanel.backgroundColor = panelBackgroundColor("manifest");
    manifestPanelMeta.fg = palette.muted;
    manifestList.verticalScrollbarOptions = {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    };

    if (dockerPanel && dockerPanelMeta && dockerList) {
      dockerPanel.backgroundColor = panelBackgroundColor("docker");
      dockerPanelMeta.fg = palette.muted;
      dockerList.verticalScrollbarOptions = {
        trackOptions: {
          backgroundColor: palette.element,
          foregroundColor: palette.border,
        },
      };
    }

    logPanel.backgroundColor = panelBackgroundColor("logs");
    logPanelMeta.fg = palette.muted;
    logList.verticalScrollbarOptions = {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    };

    footerStatePanel.backgroundColor = palette.panel;
    footerShortcutsPanel.backgroundColor = palette.panel;

    overlayBg.backgroundColor = palette.overlay;

    editOverlay.backgroundColor = palette.modal;
    editTitle.fg = palette.accent;
    editError.fg = palette.red;
    editTextarea.backgroundColor = palette.input;
    editTextarea.textColor = palette.active;
    editTextarea.focusedBackgroundColor = palette.inputFocus;

    addOverlay.backgroundColor = palette.modal;
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

    discoveryOverlay.backgroundColor = palette.modal;
    discoveryTitle.fg = palette.accent;
    discoverySummary.fg = palette.muted;
    discoveryWarningTitle.fg = palette.amber;
    discoveryError.fg = palette.red;
    if (discoveryOverlay.visible || discoverySelection !== null) {
      renderDiscoveryOverlay();
    }

    deleteOverlay.backgroundColor = palette.modal;
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
      discoveryOverlay.visible = false;
      deleteOverlay.visible = false;
      editError.content = "";
      editTextarea.initialValue = toml;
      renderer.requestRender();
      focusWhenVisible(editOverlay, () => editTextarea.focus());
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
      discoveryOverlay.visible = false;
      deleteOverlay.visible = false;
      addError.content = "";
      addFocusField = "name";
      addNameInput.value = "";
      addCommandInput.value = "";
      addNameInput.blur();
      addCommandInput.blur();
      applyAddFocusStyles();
      renderer.requestRender();
      focusWhenVisible(addOverlay, () => addNameInput.focus());
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
      discoveryOverlay.visible = false;
      deleteMessage.content = `Delete "${name}"? (y/n)`;
      renderer.requestRender();
    },

    hideDeleteConfirm() {
      overlayBg.visible = false;
      deleteOverlay.visible = false;
      renderer.requestRender();
    },

    showDiscoveryOverlay(selection: DiscoverySelection, warnings: string[]) {
      overlayBg.visible = true;
      discoveryOverlay.visible = true;
      editOverlay.visible = false;
      addOverlay.visible = false;
      deleteOverlay.visible = false;
      discoveryError.content = "";

      unsubDiscoverySelection?.();
      discoverySelection = selection;
      discoveryWarnings = [...warnings];
      unsubDiscoverySelection = selection.onUpdate(() => {
        renderDiscoveryOverlay();
        renderer.requestRender();
      });

      renderDiscoveryOverlay();
      renderer.requestRender();
    },

    hideDiscoveryOverlay() {
      overlayBg.visible = false;
      discoveryOverlay.visible = false;
      discoveryError.content = "";

      unsubDiscoverySelection?.();
      unsubDiscoverySelection = null;
      discoverySelection = null;
      discoveryWarnings = [];
      clearDiscoverySelectionLines();
      clearDiscoveryWarningLines();

      renderer.requestRender();
    },

    setDiscoveryError(message: string) {
      discoveryError.content = message;
      renderer.requestRender();
    },

    clearDiscoveryError() {
      discoveryError.content = "";
      renderer.requestRender();
    },

    renderAll,

    scrollLogs(delta: number) {
      const next = Math.max(0, Math.min(logList.scrollTop + delta, getScrollBoxMaxTop(logList)));
      logList.scrollTop = next;
      logsFollowTail = next >= getScrollBoxMaxTop(logList);
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsPage(deltaPages: number) {
      const pageSize = Math.max(1, Math.floor(logList.viewport.height) - 1);
      const next = Math.max(
        0,
        Math.min(logList.scrollTop + pageSize * deltaPages, getScrollBoxMaxTop(logList)),
      );
      logList.scrollTop = next;
      logsFollowTail = next >= getScrollBoxMaxTop(logList);
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsToTop() {
      logList.scrollTop = 0;
      logsFollowTail = false;
      renderer.requestRender();
      rebuildFooter();
    },

    scrollLogsToBottom() {
      logList.scrollTop = getScrollBoxMaxTop(logList);
      logsFollowTail = true;
      renderer.requestRender();
      rebuildFooter();
    },

    toggleLogsFollowTail() {
      logsFollowTail = !logsFollowTail;
      if (logsFollowTail) {
        logList.scrollTop = getScrollBoxMaxTop(logList);
      }
      renderAll();
      return logsFollowTail;
    },

    setLogsFollowTail(enabled: boolean) {
      logsFollowTail = enabled;
      if (logsFollowTail) {
        logList.scrollTop = getScrollBoxMaxTop(logList);
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
    unsubDiscoverySelection?.();
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
    paddingTop: APP_INSET_Y,
    paddingBottom: APP_INSET_Y,
    paddingLeft: APP_INSET_X,
    paddingRight: APP_INSET_X,
    rowGap: PANEL_GAP_Y,
  });

  const header = new BoxRenderable(renderer, {
    width: "100%",
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
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
    paddingX: INPUT_PADDING_X,
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
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  });

  const card = new BoxRenderable(renderer, {
    width: 86,
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    flexDirection: "column",
    rowGap: PANEL_CONTENT_GAP_Y,
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
    gap: COMPACT_GAP,
  });
  card.add(selectionContainer);

  const warningTitle = new TextRenderable(renderer, {
    content: "",
    fg: palette.amber,
  });
  card.add(warningTitle);

  const warningContainer = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: COMPACT_GAP,
  });
  card.add(warningContainer);

  const prompt = new TextRenderable(renderer, {
    content: "",
    fg: palette.muted,
  });
  card.add(prompt);

  main.add(card);

  const footer = new BoxRenderable(renderer, {
    width: "100%",
    backgroundColor: palette.panel,
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    alignItems: "center",
    justifyContent: "center",
  });

  const footerPill = new BoxRenderable(renderer, {
    paddingX: INPUT_PADDING_X,
    alignItems: "center",
    width: "100%",
  });

  const footerRow = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    columnGap: INLINE_GAP_X,
    rowGap: INLINE_GAP_Y,
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
    header.backgroundColor = palette.panel;
    title.fg = palette.muted;
    versionText.fg = palette.active;
    card.backgroundColor = palette.panel;
    footer.backgroundColor = palette.panel;
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
