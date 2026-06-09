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
import type { ExternalRuntimeVisibilityManager } from "./external-runtime";
import type { FocusManager } from "./focus";
import {
  ProcessTreeMetricsSampler,
  formatBytes,
  formatCountdown,
  formatCpuPercent,
  formatDuration,
  type ProcessMetricsSample,
} from "./process-metrics";
import { getRuntimeStatusView } from "./runtime-status";
import type { ServiceManager, ServiceView } from "./service-manager";
import { formatCommandSpec } from "./shared";
import type {
  ExternalManagedProcess,
  LogEntry,
  Manifest,
  PanelId,
  RuntimeStatus,
  Shortcut,
} from "./types";
import { STASIUM_VERSION } from "./version";

interface Palette {
  active: string;
  muted: string;
  panel: string;
  panelActive: string;
  selection: string;
  hover: string;
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
  hover: "#262626",
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
  hover: "#dedede",
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
const VERSION_LABEL = `Stasium v${STASIUM_VERSION}`;
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
const LOG_DETAIL_PADDING_LEFT = LOG_TIMESTAMP_WIDTH + LOG_STREAM_WIDTH + LOG_ROW_GAP_X * 2;
const MIN_LOG_PANEL_WIDTH = 56;
const MIN_APP_WIDTH = 80;
const MIN_APP_HEIGHT_WITH_EXTERNAL_RUNTIME = 35;
const MIN_APP_HEIGHT_NO_EXTERNAL_RUNTIME = 28;

const runtimeStatusColor = (status: RuntimeStatus, palette: Palette): string => {
  switch (getRuntimeStatusView(status).severity) {
    case "good":
      return palette.green;
    case "attention":
      return palette.amber;
    case "bad":
      return palette.red;
    case "muted":
      return palette.muted;
  }
};

const formatRuntimeStatus = (status: RuntimeStatus) => getRuntimeStatusView(status).code;

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
  const prefix = selected ? "┃" : " ";
  const status = formatRuntimeStatus(view.runtimeStatus);
  const meta =
    view.restartInMs !== null
      ? `${Math.ceil(view.restartInMs)}ms`
      : view.lastExitCode !== null && view.lastExitCode !== 0
        ? `Ext ${formatExit(view.lastExitCode)}`
        : view.restartCount > 0
          ? `Rst ${view.restartCount}`
          : "";

  const baseWidth = 2 + status.length + 2;
  const metaWidth = rowWidth >= 56 ? 12 : rowWidth >= 46 ? 8 : 0;
  const nameWidth = Math.max(4, rowWidth - baseWidth - (metaWidth > 0 ? metaWidth + 1 : 0));
  const name = padRight(view.name, nameWidth);

  if (metaWidth > 0 && meta) {
    const right = truncateText(meta, metaWidth).padStart(metaWidth, " ");
    return `${prefix} ${status}  ${name} ${right}`.slice(0, rowWidth);
  }

  return `${prefix} ${status}  ${name}`.slice(0, rowWidth);
};

const formatExternalProcessLine = (
  service: ExternalManagedProcess,
  selected: boolean,
  rowWidth: number,
): string => {
  if (rowWidth <= 0) return "";
  const prefix = selected ? ">" : " ";
  const status = formatRuntimeStatus(service.runtimeStatus);
  const meta = service.ports ? `ports:${service.ports}` : service.status;

  const baseWidth = 2 + status.length + 2;
  const metaWidth = rowWidth >= 52 ? 18 : rowWidth >= 42 ? 12 : 0;
  const nameWidth = Math.max(4, rowWidth - baseWidth - (metaWidth > 0 ? metaWidth + 1 : 0));
  const name = padRight(service.name, nameWidth);

  if (metaWidth > 0) {
    const right = padRight(meta, metaWidth);
    return `${prefix} ${status}  ${name} ${right}`.slice(0, rowWidth);
  }

  return `${prefix} ${status}  ${name}`.slice(0, rowWidth);
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
  entryKey: string | null;
  box: BoxRenderable;
  summary: BoxRenderable;
  timestamp: TextRenderable;
  stream: TextRenderable;
  message: TextRenderable;
  meta: TextRenderable;
  detail: TextRenderable;
}

export interface UiOptions {
  renderer: CliRenderer;
  manifest: Manifest;
  manager: ServiceManager;
  focusManager: FocusManager;
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null;
}

export interface UiControls {
  setShortcutHandler: (handler: ((shortcut: Shortcut) => void) | null) => void;
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
  moveLogSelection: (delta: number) => void;
  scrollLogs: (delta: number) => void;
  scrollLogsPage: (deltaPages: number) => void;
  scrollLogsToTop: () => void;
  scrollLogsToBottom: () => void;
  toggleLogsFollowTail: () => boolean;
  getLogsFollowTail: () => boolean;
  setLogsFollowTail: (enabled: boolean) => void;
  clearLogs: () => void;
  isLogsPanelVisible: () => boolean;
}

export const buildUi = (opts: UiOptions): { teardown: () => void; controls: UiControls } => {
  const { renderer, manifest, manager, focusManager, externalRuntimeManager } = opts;
  const hasExternalRuntime = externalRuntimeManager !== null;
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

  const headerStatusRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    columnGap: INLINE_GAP_X,
    rowGap: INLINE_GAP_Y,
    flexWrap: "wrap",
  });

  headerRight.add(headerVersion);
  headerRight.add(headerStatusRow);

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

  let externalPanel: BoxRenderable | null = null;
  let externalPanelTitle: TextRenderable | null = null;
  let externalPanelMeta: TextRenderable | null = null;
  let externalList: ScrollBoxRenderable | null = null;

  if (hasExternalRuntime) {
    const panelParts = createPanel("External", "external");
    externalPanel = panelParts.panel;
    externalPanelTitle = panelParts.titleText;
    externalPanelMeta = panelParts.metaText;

    externalList = new ScrollBoxRenderable(renderer, {
      id: "external-list",
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
    externalPanel.add(externalList);
  }

  const {
    panel: logPanel,
    titleText: logPanelTitle,
    metaText: logPanelMeta,
  } = createPanel("Logs", "logs");

  const servicePanel = new BoxRenderable(renderer, {
    id: "selected-process-panel",
    flexShrink: 0,
    width: "100%",
    flexDirection: "column",
    paddingTop: PANEL_PADDING_Y,
    paddingBottom: PANEL_PADDING_Y,
    paddingLeft: PANEL_PADDING_X,
    paddingRight: PANEL_PADDING_X,
    rowGap: PANEL_CONTENT_GAP_Y,
    backgroundColor: palette.panel,
  });

  const serviceHeading = new BoxRenderable(renderer, {
    flexShrink: 0,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: INLINE_GAP_X,
  });

  const servicePanelTitle = new TextRenderable(renderer, {
    content: "Process",
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });

  const servicePanelDetail = new TextRenderable(renderer, {
    content: "—",
    fg: palette.muted,
    wrapMode: "none",
    truncate: true,
  });

  serviceHeading.add(servicePanelTitle);
  servicePanel.add(serviceHeading);
  servicePanel.add(servicePanelDetail);

  const logList = new ScrollBoxRenderable(renderer, {
    id: "log-list",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
    rootOptions: {
      backgroundColor: palette.panel,
    },
    wrapperOptions: {
      backgroundColor: palette.panel,
    },
    viewportOptions: {
      paddingRight: SCROLLBAR_PADDING_RIGHT,
      backgroundColor: palette.panel,
    },
    contentOptions: {
      flexDirection: "column",
      gap: COMPACT_GAP,
      backgroundColor: palette.panel,
    },
    verticalScrollbarOptions: {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    },
  });
  logPanel.add(logList);

  const outputColumn = new BoxRenderable(renderer, {
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    flexDirection: "column",
    rowGap: PANEL_GAP_Y,
  });

  sideColumn.add(manifestPanel);
  if (externalPanel) {
    sideColumn.add(externalPanel);
  }
  outputColumn.add(servicePanel);
  outputColumn.add(logPanel);
  main.add(sideColumn);
  main.add(outputColumn);

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
    backgroundColor: "transparent",
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

  let headerStatusItems: BoxRenderable[] = [];
  let footerStateItems: TextRenderable[] = [];
  let footerShortcutItems: BoxRenderable[] = [];
  let hoveredFooterShortcutIndex = -1;
  let shortcutHandler: ((shortcut: Shortcut) => void) | null = null;

  const compactShortcutLabels: Record<string, string> = {
    "switch panel": "switch",
    "next field": "next",
    follow: "tail",
    scope: "scope",
    "all logs": "all logs",
    "service logs": "svc logs",
    discover: "scan",
    "manifest panel": "manifest",
    "external panel": "external",
    "logs panel": "logs",
    "all panels": "all",
  };

  const shortcutPriority: Record<string, number> = {
    start: 90,
    stop: 90,
    restart: 85,
    scope: 82,
    "all logs": 82,
    "service logs": 82,
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
    "manifest panel": 60,
    "external panel": 60,
    "logs panel": 60,
    "all panels": 65,
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
      return sum + shortcut.key.length + label.length + 6;
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
    const baseShortcuts = logsPanelVisible
      ? focusManager.getShortcuts()
      : focusManager
          .getShortcuts()
          .filter((shortcut) => shortcut.label !== "log page" && shortcut.label !== "log jump");
    const shortcuts = baseShortcuts.map((shortcut) =>
      shortcut.label === "scope"
        ? { ...shortcut, label: manager.getSelectedView() ? "all logs" : "service logs" }
        : shortcut,
    );
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
      case "external":
        return "external";
      case "logs":
        return "logs";
      default:
        return panel;
    }
  };

  const formatVisiblePanels = (panels: PanelId[]): string => {
    if (panels.length === 0) return "none";
    if (
      panels.length === focusManager.getVisiblePanels().length &&
      panels.length === (hasExternalRuntime ? 3 : 2)
    ) {
      return "all";
    }
    return panels.map(panelName).join("+");
  };

  const getRenderedPanels = (): PanelId[] => {
    const panels: PanelId[] = [];
    if (manifestPanel.visible) panels.push("manifest");
    if (externalPanel?.visible) panels.push("external");
    if (logPanel.visible) panels.push("logs");
    return panels;
  };

  const isPanelRendered = (panel: PanelId): boolean => getRenderedPanels().includes(panel);

  const summaryColor = (active: number, total: number, failures = 0): string => {
    if (failures > 0) return palette.red;
    if (total === 0) return palette.muted;
    if (active === total) return palette.green;
    if (active > 0) return palette.amber;
    return palette.muted;
  };

  const statusSummaryOrder: RuntimeStatus[] = [
    "errored",
    "retrying",
    "blocked",
    "starting",
    "stopping",
    "off",
    "paused",
    "unknown",
    "running",
  ];

  const formatStatusSummary = (statuses: RuntimeStatus[], emptyLabel: string): string => {
    if (statuses.length === 0) return emptyLabel;
    const counts = new Map<RuntimeStatus, number>();
    for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
    return statusSummaryOrder
      .filter((status) => counts.has(status))
      .map((status) => `${counts.get(status)} ${getRuntimeStatusView(status).code}`)
      .join(" · ");
  };

  const serviceDetailSegments = (): string[] => {
    const selected = manager.getSelectedView();
    if (!selected) return ["—"];

    const status = getRuntimeStatusView(selected.runtimeStatus).code;
    const pidInfo = selectedProcessPidInfo();
    const pid = pidInfo?.pid ?? null;
    const countdown =
      selected.runtimeStatus === "retrying" ? [formatCountdown(selected.restartInMs)] : [];
    const cpu = pid ? formatCpuPercent(selectedMetrics?.cpuPercent ?? null) : "—";
    const mem = pid ? formatBytes(selectedMetrics?.rssBytes ?? null) : "—";
    const up = pidInfo ? formatDuration(pidInfo.startedAt) : "—";
    const ext = selected.lastExitCode === null ? "—" : formatExit(selected.lastExitCode);

    return [
      status,
      ...countdown,
      `Pid ${pid ?? "—"}`,
      `Cpu ${cpu}`,
      `Mem ${mem}`,
      `Up ${up}`,
      `Ext ${ext}`,
      `Rst ${selected.restartCount}`,
    ];
  };

  const rebuildServicePanel = (): void => {
    const selected = manager.getSelectedView();
    servicePanelTitle.content = selected ? `Process (${selected.name})` : "Process";
    servicePanelTitle.fg = panelTitleColor("logs");
    servicePanelDetail.content = serviceDetailSegments().join("  ");
    servicePanelDetail.fg = selected
      ? runtimeStatusColor(selected.runtimeStatus, palette)
      : palette.muted;
  };

  const footerShortcutBackground = (hovered: boolean): string =>
    hovered ? palette.hover : "transparent";

  const clearHeaderStatus = () => {
    for (const item of headerStatusItems) {
      headerStatusRow.remove(item.id);
      item.destroy();
    }
    headerStatusItems = [];
  };

  const buildHeaderStatus = (): Array<{ content: string; fg: string; panel?: PanelId }> => {
    const views = manager.getViews();
    const manifestStatuses = views.map((view) => view.runtimeStatus);
    const running = manifestStatuses.filter((status) => status === "running").length;
    const failed = manifestStatuses.filter((status) => status === "errored").length;
    const segments: Array<{ content: string; fg: string; panel?: PanelId }> = [
      {
        content: formatStatusSummary(manifestStatuses, "Add a service"),
        fg: summaryColor(running, views.length, failed),
        panel: "manifest",
      },
    ];

    if (hasExternalRuntime && externalRuntimeManager) {
      const externalProcesses = externalRuntimeManager.getProcesses();
      const externalStatuses = externalProcesses.map((process) => process.runtimeStatus);
      const externalRunning = externalStatuses.filter((status) => status === "running").length;
      const externalErrored = externalStatuses.filter((status) => status === "errored").length;

      segments.push({
        content: `external ${formatStatusSummary(externalStatuses, "0 services")}`,
        fg: summaryColor(externalRunning, externalProcesses.length, externalErrored),
        panel: "external",
      });

      return segments;
    }

    return segments;
  };

  const rebuildHeaderStatus = () => {
    clearHeaderStatus();

    buildHeaderStatus().forEach((segment, index) => {
      const box = new BoxRenderable(renderer, {
        id: `header-status-${index}`,
        flexDirection: "row",
        alignItems: "center",
        paddingX: INPUT_PADDING_X,
        backgroundColor: "transparent",
      });

      const text = new TextRenderable(renderer, {
        content: segment.content,
        fg: segment.fg,
        wrapMode: "none",
        truncate: true,
      });

      box.onMouseDown = (event) => {
        if (!segment.panel) return;
        event.stopPropagation();
        collapseExpandedLog();
        activatePanel(segment.panel);
      };

      box.add(text);
      headerStatusRow.add(box);
      headerStatusItems.push(box);
    });
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
    const visiblePanels = getRenderedPanels();
    const requestedPanels = focusManager.getVisiblePanels();
    const selectedManifest = manager.getSelectedView();
    const selectedExternalProcess = externalRuntimeManager?.getSelectedService() ?? null;
    const activeLogName =
      logSource === "external"
        ? (selectedExternalProcess?.name ?? "external")
        : (selectedManifest?.name ?? "all");
    const tailState = logsFollowTail ? "tail:on" : "tail:paused";
    const manifestStatus = selectedManifest
      ? getRuntimeStatusView(selectedManifest.runtimeStatus)
      : null;
    const externalProcessStatus = selectedExternalProcess
      ? getRuntimeStatusView(selectedExternalProcess.runtimeStatus)
      : null;

    const segments = [
      { content: `layout:${formatVisiblePanels(visiblePanels)}`, fg: palette.secondary },
      { content: `panel:${panelName(activePanel)}`, fg: panelTitleColor(activePanel) },
      {
        content: `svc:${selectedManifest?.name ?? "-"} (${manifestStatus?.label ?? "none"})`,
        fg: manifestStatus ? runtimeStatusColor(manifestStatus.status, palette) : palette.muted,
      },
      {
        content: `external:${selectedExternalProcess?.name ?? "-"} (${externalProcessStatus?.label ?? "none"})`,
        fg: externalProcessStatus
          ? runtimeStatusColor(externalProcessStatus.status, palette)
          : palette.muted,
      },
      {
        content: logsPanelVisible ? `logs:${activeLogName} ${tailState}` : "logs:hidden",
        fg: logsPanelVisible ? (logsFollowTail ? palette.secondary : palette.muted) : palette.muted,
      },
    ];

    if (requestedPanels.includes("logs") && !visiblePanels.includes("logs")) {
      segments.push({ content: "logs:auto-hidden", fg: palette.amber });
    }

    return segments;
  };

  const rebuildFooter = () => {
    for (const item of footerStateItems) {
      footerStateRow.remove(item.id);
      item.destroy();
    }
    footerStateItems = [];

    for (const item of footerShortcutItems) {
      footerRow.remove(item.id);
      item.destroy();
    }
    footerShortcutItems = [];

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
      const box = new BoxRenderable(renderer, {
        id: `footer-shortcut-${index}`,
        flexDirection: "row",
        alignItems: "center",
        columnGap: 1,
        paddingX: INPUT_PADDING_X,
        backgroundColor: footerShortcutBackground(index === hoveredFooterShortcutIndex),
      });

      const keyText = new TextRenderable(renderer, {
        id: `footer-key-${index}`,
        content: shortcut.key,
        fg: palette.secondary,
        wrapMode: "none",
        truncate: true,
      });

      const labelText = new TextRenderable(renderer, {
        id: `footer-label-${index}`,
        content: shortcutLabel(shortcut, labelMode),
        fg: palette.active,
        wrapMode: "none",
        truncate: true,
      });

      box.onMouseDown = (event) => {
        event.stopPropagation();
        if (!isMouseInteractive()) return;
        collapseExpandedLog();
        shortcutHandler?.(shortcut);
      };
      box.onMouseOver = () => {
        if (hoveredFooterShortcutIndex === index) return;
        hoveredFooterShortcutIndex = index;
        renderAll();
      };
      box.onMouseOut = () => {
        if (hoveredFooterShortcutIndex !== index) return;
        hoveredFooterShortcutIndex = -1;
        renderAll();
      };

      box.add(keyText);
      box.add(labelText);
      footerRow.add(box);
      footerShortcutItems.push(box);
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
  let externalLines: TextRenderable[] = [];
  let logLines: LogRowRenderable[] = [];
  let logSource: "manifest" | "external" = "manifest";
  let logsPanelVisible = true;
  let logsFollowTail = true;
  let lastLogVersion = -1;
  let lastSelectedIndex = -1;
  let lastLogSource: "manifest" | "external" = "manifest";
  let hoveredLogEntryKey: string | null = null;
  let selectedLogEntryKey: string | null = null;
  let expandedLogEntryKey: string | null = null;
  let hoveredManifestIndex = -1;
  let hoveredExternalIndex = -1;
  let addFocusField: "name" | "command" = "name";
  let discoverySelection: DiscoverySelection | null = null;
  let discoveryWarnings: string[] = [];
  let discoverySelectionLines: TextRenderable[] = [];
  let discoveryWarningLines: TextRenderable[] = [];
  let unsubDiscoverySelection: (() => void) | null = null;
  const metricsSampler = new ProcessTreeMetricsSampler();
  let selectedMetrics: ProcessMetricsSample | null = null;
  let selectedMetricsKey: string | null = null;
  let metricsRefreshing = false;
  const metricsTimer = setInterval(() => {
    void refreshSelectedMetrics();
  }, 1000);

  const panelTitleColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.accent : palette.muted;

  const panelBackgroundColor = (panel: PanelId): string =>
    focusManager.isPanelActive(panel) ? palette.panelActive : palette.panel;

  const selectedProcessPidInfo = () => {
    const selected = manager.getSelectedView();
    if (!selected) return null;
    return manager.getServicePids().find((entry) => entry.name === selected.name) ?? null;
  };

  const refreshSelectedMetrics = async (): Promise<void> => {
    if (metricsRefreshing) return;
    metricsRefreshing = true;
    try {
      const selected = manager.getSelectedView();
      const pidInfo = selectedProcessPidInfo();
      const key = selected && pidInfo ? `${selected.name}:${pidInfo.pid}` : null;
      if (key !== selectedMetricsKey) {
        selectedMetricsKey = key;
        metricsSampler.reset();
        selectedMetrics = null;
      }

      selectedMetrics = await metricsSampler.sample(pidInfo?.pid ?? null);
      renderAll();
    } finally {
      metricsRefreshing = false;
    }
  };

  const listSelectionBackground = (): string => palette.selection;

  const listHoverBackground = (): string => palette.hover;

  const invalidateLogs = (): void => {
    lastLogVersion = -1;
  };

  const resetLogInteraction = (): void => {
    hoveredLogEntryKey = null;
    selectedLogEntryKey = null;
    expandedLogEntryKey = null;
    invalidateLogs();
  };

  const collapseExpandedLog = (): void => {
    if (expandedLogEntryKey === null) return;
    expandedLogEntryKey = null;
    invalidateLogs();
    renderAll();
  };

  const getLogEntryKey = (entry: LogEntry, index: number): string =>
    `${entry.timestamp}:${entry.stream}:${index}:${entry.line}`;

  const getManifestLogTarget = (): {
    entries: LogEntry[];
    version: number;
    name: string | null;
  } => {
    const selected = manager.getSelectedView();
    if (selected) {
      return {
        entries: selected.log.all(),
        version: selected.log.getVersion(),
        name: selected.name,
      };
    }

    const entries = manager
      .getViews()
      .flatMap((view) =>
        view.log.all().map((entry) => ({
          ...entry,
          line: `[${view.name}] ${entry.line}`,
        })),
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      entries,
      version: manager.getViews().reduce((sum, view) => sum + view.log.getVersion(), 0),
      name: null,
    };
  };

  const listRowBackground = (panel: PanelId, selected: boolean, hovered: boolean): string => {
    if (selected) return listSelectionBackground();
    if (hovered) return listHoverBackground();
    return panelBackgroundColor(panel);
  };

  const logRowBackground = (key: string): string => {
    if (selectedLogEntryKey === key) return listSelectionBackground();
    if (hoveredLogEntryKey === key) return listHoverBackground();
    return panelBackgroundColor("logs");
  };

  const isMouseInteractive = (): boolean =>
    focusManager.getMode() === "normal" && !overlayBg.visible && !tooSmallOverlay.visible;

  const activatePanel = (panel: PanelId): void => {
    if (!isMouseInteractive()) return;
    if (!isPanelRendered(panel)) return;
    focusManager.setActivePanel(panel);
  };

  const setHoveredManifestRow = (index: number): void => {
    if (hoveredManifestIndex === index) return;
    hoveredManifestIndex = index;
    renderAll();
  };

  const setHoveredExternalRow = (index: number): void => {
    if (hoveredExternalIndex === index) return;
    hoveredExternalIndex = index;
    renderAll();
  };

  const setHoveredLogRow = (key: string | null): void => {
    if (hoveredLogEntryKey === key) return;
    hoveredLogEntryKey = key;
    invalidateLogs();
    renderAll();
  };

  const selectManifestRow = (index: number): void => {
    if (!isMouseInteractive()) return;
    activatePanel("manifest");
    manager.setSelectedIndex(index);
  };

  const selectExternalRow = (index: number): void => {
    if (!isMouseInteractive() || !externalRuntimeManager) return;
    activatePanel("external");
    externalRuntimeManager.selectIndex(index);
  };

  const toggleLogRow = (entry: LogEntry, index: number): void => {
    if (!isMouseInteractive()) return;

    activatePanel("logs");
    const key = getLogEntryKey(entry, index);
    selectedLogEntryKey = key;
    expandedLogEntryKey = expandedLogEntryKey === key ? null : key;
    logsFollowTail = false;
    invalidateLogs();
    renderAll();
  };

  const getActiveLogEntries = (): LogEntry[] => {
    const source = logSource === "external" && externalRuntimeManager ? "external" : "manifest";
    if (source === "external") return externalRuntimeManager?.getActiveLogBuffer()?.all() ?? [];
    return getManifestLogTarget().entries;
  };

  const moveLogSelection = (delta: number): void => {
    const entries = getActiveLogEntries();
    if (entries.length === 0) return;

    const currentIndex = selectedLogEntryKey
      ? entries.findIndex((entry, index) => getLogEntryKey(entry, index) === selectedLogEntryKey)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? delta < 0
          ? entries.length - 1
          : 0
        : clamp(currentIndex + delta, 0, entries.length - 1);
    const nextEntry = entries[nextIndex];
    if (!nextEntry) return;

    activatePanel("logs");
    selectedLogEntryKey = getLogEntryKey(nextEntry, nextIndex);
    expandedLogEntryKey = selectedLogEntryKey;
    logsFollowTail = false;
    invalidateLogs();
    renderAll();
  };

  const focusWhenVisible = (target: BoxRenderable, focus: () => void): void => {
    queueMicrotask(() => {
      if (!target.visible) return;
      focus();
      renderer.requestRender();
    });
  };

  const updateTooSmallState = (): boolean => {
    const minHeight = hasExternalRuntime
      ? MIN_APP_HEIGHT_WITH_EXTERNAL_RUNTIME
      : MIN_APP_HEIGHT_NO_EXTERNAL_RUNTIME;
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
        flexDirection: "column",
        backgroundColor: panelBackgroundColor("logs"),
      });

      const summary = new BoxRenderable(renderer, {
        id: `log-row-summary-${index}`,
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

      const detail = new TextRenderable(renderer, {
        id: `log-row-detail-${index}`,
        width: "100%",
        fg: palette.active,
        wrapMode: "char",
        visible: false,
      });

      summary.add(timestamp);
      summary.add(stream);
      summary.add(message);
      summary.add(meta);
      box.add(summary);
      box.add(detail);
      logList.add(box);
      nextRows.push({ entryKey: null, box, summary, timestamp, stream, message, meta, detail });
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

  manifestPanel.onMouseDown = () => activatePanel("manifest");
  manifestList.onMouseDown = () => activatePanel("manifest");
  manifestList.onMouseOut = () => setHoveredManifestRow(-1);

  if (externalPanel && externalList) {
    externalPanel.onMouseDown = () => activatePanel("external");
    externalList.onMouseDown = () => activatePanel("external");
    externalList.onMouseOut = () => setHoveredExternalRow(-1);
  }

  logPanel.onMouseDown = () => activatePanel("logs");
  logList.onMouseDown = () => activatePanel("logs");
  logList.onMouseOut = () => setHoveredLogRow(null);
  root.onMouseDown = () => collapseExpandedLog();

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
    rebuildHeaderStatus();
  };

  const rebuildList = (views: ServiceView[], selectedIndex: number) => {
    if (views.length === 0) {
      listLines = syncRows(manifestList, listLines, 1, "service");
      const line = listLines[0];
      if (line) {
        line.content = "No Process Definitions yet. Press a to add or i to discover.";
        line.fg = palette.muted;
        line.bg = panelBackgroundColor("manifest");
        line.onMouseDown = undefined;
        line.onMouseOver = undefined;
        line.onMouseOut = undefined;
      }
      manifestPanelMeta.content = "Add a service";
      return;
    }

    listLines = syncRows(manifestList, listLines, views.length, "service");
    const viewportWidth = Math.floor(manifestList.viewport.width);
    const rowWidth = Math.max(20, viewportWidth > 0 ? viewportWidth - 1 : 48);

    views.forEach((view, index) => {
      const selected = index === selectedIndex;
      const line = listLines[index];
      if (!line) return;
      const status = view.runtimeStatus;
      line.content = formatManifestLine(view, selected, rowWidth);
      line.fg = runtimeStatusColor(status, palette);
      line.bg = listRowBackground("manifest", selected, index === hoveredManifestIndex);
      line.onMouseDown = (event) => {
        event.stopPropagation();
        selectManifestRow(index);
      };
      line.onMouseOver = () => setHoveredManifestRow(index);
      line.onMouseOut = () => {
        if (hoveredManifestIndex === index) setHoveredManifestRow(-1);
      };
    });

    manifestPanelMeta.content = formatStatusSummary(
      views.map((view) => view.runtimeStatus),
      "Add a service",
    );
    ensureIndexVisible(manifestList, selectedIndex);
  };

  const rebuildExternalList = () => {
    if (!externalRuntimeManager || !externalList || !externalPanelMeta) return;

    const services = externalRuntimeManager.getProcesses();
    const selectedIdx = externalRuntimeManager.getSelectedIndex();
    externalLines = syncRows(externalList, externalLines, services.length, "external");

    const viewportWidth = Math.floor(externalList.viewport.width);
    const rowWidth = Math.max(20, viewportWidth > 0 ? viewportWidth - 1 : 44);

    services.forEach((service, index) => {
      const selected = index === selectedIdx;
      const line = externalLines[index];
      if (!line) return;
      const status = service.runtimeStatus;
      line.content = formatExternalProcessLine(service, selected, rowWidth);
      line.fg = runtimeStatusColor(status, palette);
      line.bg = listRowBackground("external", selected, index === hoveredExternalIndex);
      line.onMouseDown = (event) => {
        event.stopPropagation();
        selectExternalRow(index);
      };
      line.onMouseOver = () => setHoveredExternalRow(index);
      line.onMouseOut = () => {
        if (hoveredExternalIndex === index) setHoveredExternalRow(-1);
      };
    });

    externalPanelMeta.content = formatStatusSummary(
      services.map((service) => service.runtimeStatus),
      "0 services",
    );
    ensureIndexVisible(externalList, selectedIdx);
  };

  const rebuildLogs = () => {
    const source = logSource === "external" && externalRuntimeManager ? "external" : "manifest";
    const selectedIndex =
      source === "external"
        ? (externalRuntimeManager?.getSelectedIndex() ?? 0)
        : manager.getSelectedIndex();
    const manifestLogTarget = source === "manifest" ? getManifestLogTarget() : null;
    const externalLogBuffer =
      source === "external" ? (externalRuntimeManager?.getActiveLogBuffer() ?? null) : null;
    const version = manifestLogTarget?.version ?? externalLogBuffer?.getVersion() ?? 0;

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

    if (switchedTarget) resetLogInteraction();

    lastLogVersion = version;
    lastSelectedIndex = selectedIndex;
    lastLogSource = source;

    const entries = manifestLogTarget?.entries ?? externalLogBuffer?.all() ?? [];
    const entryKeys = new Set(entries.map((entry, index) => getLogEntryKey(entry, index)));
    if (hoveredLogEntryKey && !entryKeys.has(hoveredLogEntryKey)) hoveredLogEntryKey = null;
    if (selectedLogEntryKey && !entryKeys.has(selectedLogEntryKey)) selectedLogEntryKey = null;
    if (expandedLogEntryKey && !entryKeys.has(expandedLogEntryKey)) expandedLogEntryKey = null;

    logLines = syncLogRows(entries.length);

    const viewportWidth = Math.floor(logList.viewport.width);
    const rowWidth = Math.max(24, viewportWidth > 0 ? viewportWidth - 1 : 64);

    entries.forEach((entry, index) => {
      const row = logLines[index];
      if (!row) return;

      const key = getLogEntryKey(entry, index);
      const expanded = expandedLogEntryKey === key;
      const backgroundColor = logRowBackground(key);
      row.entryKey = key;
      const metaBase = `#${index + 1}`;
      const reservedWidth =
        LOG_TIMESTAMP_WIDTH + LOG_STREAM_WIDTH + metaBase.length + LOG_ROW_GAP_X * 3;
      const messageWidth = Math.max(LOG_MIN_MESSAGE_WIDTH, rowWidth - reservedWidth);
      const truncated = truncateLogMessage(entry.line, messageWidth);
      const metaText = expanded
        ? `${metaBase} open`
        : truncated.hidden > 0
          ? `${metaBase} +${truncated.hidden} cols`
          : metaBase;

      row.box.backgroundColor = backgroundColor;
      row.box.rowGap = expanded ? PANEL_CONTENT_GAP_Y : COMPACT_GAP;
      row.box.paddingTop = expanded ? PANEL_CONTENT_GAP_Y : 0;
      row.box.paddingBottom = expanded ? PANEL_CONTENT_GAP_Y : 0;
      row.box.paddingLeft = expanded ? PANEL_CONTENT_GAP_Y : 0;
      row.box.paddingRight = expanded ? PANEL_CONTENT_GAP_Y : 0;
      row.box.marginY = expanded ? PANEL_CONTENT_GAP_Y : 0;
      row.summary.backgroundColor = backgroundColor;
      row.timestamp.content = formatLogTimestamp(entry.timestamp);
      row.timestamp.fg = palette.muted;
      row.stream.content = formatLogStream(entry.stream);
      row.stream.fg = entry.stream === "stderr" ? palette.red : palette.secondary;
      row.message.content = truncated.text;
      row.message.fg = entry.stream === "stderr" ? palette.red : palette.active;
      row.meta.content = metaText;
      row.meta.fg = truncated.hidden > 0 ? palette.amber : palette.muted;
      row.detail.content = `${" ".repeat(LOG_DETAIL_PADDING_LEFT)}${entry.line}`;
      row.detail.fg = entry.stream === "stderr" ? palette.red : palette.active;
      row.detail.visible = expanded;
      row.detail.bg = backgroundColor;

      row.box.onMouseDown = (event) => {
        event.stopPropagation();
        toggleLogRow(entry, index);
      };
      row.box.onMouseOver = () => setHoveredLogRow(key);
      row.box.onMouseOut = () => {
        if (hoveredLogEntryKey === key) setHoveredLogRow(null);
      };
    });

    if (switchedTarget || logsFollowTail || pinnedBottom) {
      logList.scrollTop = getScrollBoxMaxTop(logList);
    } else {
      logList.scrollTop = Math.min(previousScrollTop, getScrollBoxMaxTop(logList));
    }

    const selectedLogIndex = selectedLogEntryKey
      ? entries.findIndex((entry, index) => getLogEntryKey(entry, index) === selectedLogEntryKey)
      : -1;
    if (selectedLogIndex >= 0) {
      ensureIndexVisible(logList, selectedLogIndex);
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

    if (source === "external") {
      const selected = externalRuntimeManager?.getSelectedService();
      logPanelMeta.content = `${selected?.name ?? "external"}  lines:${entries.length}  show:${visibleStart}-${visibleEnd}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
      return;
    }

    const selected = manager.getSelectedView();
    logPanelMeta.content = `${selected?.name ?? "all services"}  lines:${entries.length}  show:${visibleStart}-${visibleEnd}  ${logsFollowTail ? "tail:on" : "tail:off"}  scroll:${scroll}%`;
  };

  const updatePanelStyles = () => {
    manifestPanelTitle.content = "Manifest";
    manifestPanelTitle.fg = panelTitleColor("manifest");
    manifestPanel.backgroundColor = panelBackgroundColor("manifest");

    const selectedLogName =
      logSource === "external" && externalRuntimeManager
        ? externalRuntimeManager.getSelectedService()?.name
        : manager.getSelectedView()?.name;
    logPanelTitle.content = selectedLogName ? `Logs (${selectedLogName})` : "Logs";
    logPanelTitle.fg = panelTitleColor("logs");
    const logsBackground = panelBackgroundColor("logs");
    servicePanel.backgroundColor = logsBackground;
    logPanel.backgroundColor = logsBackground;
    logList.backgroundColor = logsBackground;
    logList.wrapper.backgroundColor = logsBackground;
    logList.viewport.backgroundColor = logsBackground;
    logList.content.backgroundColor = logsBackground;
    for (const row of logLines) {
      const rowBackground = row.entryKey ? logRowBackground(row.entryKey) : logsBackground;
      row.box.backgroundColor = rowBackground;
      row.summary.backgroundColor = rowBackground;
      row.detail.bg = rowBackground;
    }

    if (externalPanel && externalPanelTitle) {
      externalPanelTitle.content = "External";
      externalPanelTitle.fg = panelTitleColor("external");
      externalPanel.backgroundColor = panelBackgroundColor("external");
    }
  };

  const renderAll = () => {
    const activePanel = focusManager.getActivePanel();
    if (activePanel === "manifest") {
      logSource = "manifest";
    } else if (activePanel === "external" && externalRuntimeManager) {
      logSource = "external";
    }

    const views = manager.getViews();
    rebuildList(views, manager.getSelectedIndex());
    rebuildExternalList();
    rebuildLogs();
    rebuildServicePanel();
    updateHeader();
    updatePanelStyles();
    rebuildFooter();

    renderer.requestRender();
  };

  const applyLayout = () => {
    updateTooSmallState();

    const stacked = renderer.width < 112;
    const sideWidth = hasExternalRuntime
      ? clamp(Math.floor(renderer.width * 0.34), 36, 52)
      : clamp(Math.floor(renderer.width * 0.38), 34, 58);
    const manifestPanelVisible = focusManager.isPanelVisible("manifest");
    const externalPanelVisible = hasExternalRuntime && focusManager.isPanelVisible("external");
    const sidePanelsVisible = manifestPanelVisible || externalPanelVisible;
    const logsRequested = focusManager.isPanelVisible("logs");
    const logsWidthAvailable =
      !sidePanelsVisible ||
      (stacked
        ? renderer.width - APP_INSET_X * 2
        : renderer.width - APP_INSET_X * 2 - sideWidth - PANEL_GAP_X) >= MIN_LOG_PANEL_WIDTH;
    const nextLogsPanelVisible = logsRequested && logsWidthAvailable;

    manifestPanel.visible = manifestPanelVisible;
    if (externalPanel) {
      externalPanel.visible = externalPanelVisible;
    }
    sideColumn.visible = sidePanelsVisible;
    logsPanelVisible = nextLogsPanelVisible;
    logPanel.visible = logsPanelVisible;

    focusManager.ensureActivePanelVisible(getRenderedPanels());

    if (!sidePanelsVisible && logsPanelVisible) {
      main.flexDirection = "column";
      sideColumn.width = "100%";
      sideColumn.height = "auto";
      sideColumn.flexGrow = 0;
      manifestPanel.flexGrow = 1;
      if (externalPanel) {
        externalPanel.flexGrow = 1;
      }
      logPanel.flexGrow = 1;
    } else if (sidePanelsVisible && !logsPanelVisible) {
      main.flexDirection = "column";
      sideColumn.width = "100%";
      sideColumn.height = "auto";
      sideColumn.flexGrow = 1;
      manifestPanel.flexGrow = externalPanelVisible ? 2 : 1;
      if (externalPanel) {
        externalPanel.flexGrow = 1;
      }
      logPanel.flexGrow = 0;
    } else if (stacked) {
      main.flexDirection = "column";
      sideColumn.width = "100%";
      sideColumn.height = hasExternalRuntime
        ? Math.max(12, Math.floor(renderer.height * 0.35))
        : Math.max(10, Math.floor(renderer.height * 0.28));
      sideColumn.flexGrow = 0;
      manifestPanel.flexGrow = 1;
      if (externalPanel) {
        externalPanel.flexGrow = 1;
      }
      logPanel.flexGrow = 1;
    } else {
      main.flexDirection = "row";
      sideColumn.width = sideWidth;
      sideColumn.height = "auto";
      sideColumn.flexGrow = 0;
      manifestPanel.flexGrow = externalPanelVisible ? 2 : 1;

      if (externalPanel) {
        externalPanel.flexGrow = 1;
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

    manifestPanel.backgroundColor = panelBackgroundColor("manifest");
    manifestPanelMeta.fg = palette.muted;
    manifestList.verticalScrollbarOptions = {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    };

    if (externalPanel && externalPanelMeta && externalList) {
      externalPanel.backgroundColor = panelBackgroundColor("external");
      externalPanelMeta.fg = palette.muted;
      externalList.verticalScrollbarOptions = {
        trackOptions: {
          backgroundColor: palette.element,
          foregroundColor: palette.border,
        },
      };
    }

    const logsBackground = panelBackgroundColor("logs");
    logPanel.backgroundColor = logsBackground;
    logPanelMeta.fg = palette.muted;
    logList.backgroundColor = logsBackground;
    logList.wrapper.backgroundColor = logsBackground;
    logList.viewport.backgroundColor = logsBackground;
    logList.content.backgroundColor = logsBackground;
    logList.verticalScrollbarOptions = {
      trackOptions: {
        backgroundColor: palette.element,
        foregroundColor: palette.border,
      },
    };

    footerStatePanel.backgroundColor = palette.panel;
    footerShortcutsPanel.backgroundColor = "transparent";

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
  const unsubFocus = focusManager.onUpdate(applyLayout);
  const unsubscribeExternalRuntime = externalRuntimeManager
    ? externalRuntimeManager.onUpdate(renderAll)
    : () => {};

  const controls: UiControls = {
    setShortcutHandler(handler) {
      shortcutHandler = handler;
      renderAll();
    },

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

    moveLogSelection,

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

    getLogsFollowTail() {
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
      const source = logSource === "external" && externalRuntimeManager ? "external" : "manifest";
      if (source === "external") {
        const buffer = externalRuntimeManager?.getSelectedLogBuffer() ?? null;
        if (buffer) {
          buffer.clear();
          resetLogInteraction();
          lastLogVersion = -1;
          lastSelectedIndex = -1;
          lastLogSource = source;
          renderAll();
        }
        return;
      }

      const selectedView = manager.getSelectedView();
      const views = selectedView ? [selectedView] : manager.getViews();
      if (views.length > 0) {
        for (const view of views) {
          view.log.clear();
        }
        resetLogInteraction();
        lastLogVersion = -1;
        lastSelectedIndex = -1;
        lastLogSource = source;
        renderAll();
      }
    },

    isLogsPanelVisible() {
      return logsPanelVisible;
    },
  };

  const teardown = () => {
    renderer.off("theme_mode", applyTheme);
    renderer.off("resize", applyLayout);
    clearInterval(metricsTimer);
    unsubManager();
    unsubFocus();
    unsubscribeExternalRuntime();
    unsubDiscoverySelection?.();
    root.destroy();
  };

  return { teardown, controls };
};

interface InitUiOptions {
  selection: DiscoverySelection;
  warnings: string[];
  loading?: boolean;
  error?: string;
}

export interface InitUiControls {
  setSelection: (selection: DiscoverySelection) => void;
  setWarnings: (warnings: string[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (message: string) => void;
  clearError: () => void;
  isLoading: () => boolean;
}

const formatInitSelectionLine = (item: SelectionItem, active: boolean): string => {
  const cursor = active ? ">" : " ";
  const selected = item.selected ? "[x]" : "[ ]";
  const serviceName = item.candidate.service.name;
  const command = formatCommandSpec(item.candidate.service.command);
  return `${cursor} ${selected} ${serviceName}  ${command}`;
};

export const buildInitUi = (
  renderer: CliRenderer,
  opts: InitUiOptions,
): { teardown: () => void; controls: InitUiControls } => {
  let selection = opts.selection;
  let warnings = [...opts.warnings];
  let loading = opts.loading ?? false;
  let errorMessage = opts.error ?? "";
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

  const errorText = new TextRenderable(renderer, {
    content: "",
    fg: palette.red,
  });
  card.add(errorText);

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
  let unsubSelection: () => void = () => {};

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

    if (loading) {
      detectedSummary.content = "\nDetecting services in this workspace...";
      prompt.content = "\nPlease wait.";
      return;
    }

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

    if (loading || warnings.length === 0) {
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

  const rebuildError = () => {
    errorText.content = errorMessage ? `\n${errorMessage}` : "";
  };

  const renderAll = () => {
    rebuildSelectionLines();
    rebuildWarnings();
    rebuildError();
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
    errorText.fg = palette.red;
    prompt.fg = palette.muted;

    for (const item of footerItems) {
      const isKey = item.id.includes("-key-");
      item.fg = isKey ? palette.active : palette.muted;
    }

    renderAll();
  };

  const controls: InitUiControls = {
    setSelection(nextSelection) {
      unsubSelection();
      selection = nextSelection;
      unsubSelection = selection.onUpdate(renderAll);
      renderAll();
    },

    setWarnings(nextWarnings) {
      warnings = [...nextWarnings];
      renderAll();
    },

    setLoading(nextLoading) {
      loading = nextLoading;
      renderAll();
    },

    setError(message: string) {
      errorMessage = message;
      renderAll();
    },

    clearError() {
      errorMessage = "";
      renderAll();
    },

    isLoading() {
      return loading;
    },
  };

  unsubSelection = selection.onUpdate(renderAll);
  renderer.on("theme_mode", applyTheme);
  renderAll();

  const teardown = () => {
    renderer.off("theme_mode", applyTheme);
    unsubSelection();
    root.destroy();
  };

  return { teardown, controls };
};
