import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { Manifest } from "./types";
import type { ServiceManager, ServiceView } from "./service-manager";

const palette = {
  bg: "#111417",
  panel: "#1b2026",
  border: "#3a4450",
  text: "#d8dee9",
  muted: "#7f8c9a",
  accent: "#6cb6ff",
  success: "#45c97a",
  warn: "#f4b259",
  error: "#ef5b5b",
};

const stateColor = (state: ServiceView["state"]): string => {
  switch (state) {
    case "RUNNING":
      return palette.success;
    case "STARTING":
      return palette.warn;
    case "STOPPING":
      return palette.warn;
    case "FAILED":
      return palette.error;
    case "STOPPED":
    default:
      return palette.muted;
  }
};

const formatState = (state: ServiceView["state"]) => state.padEnd(8, " ");

const formatExit = (exit: number | null) => {
  if (exit === null) return "--";
  return String(exit);
};

const formatLogLine = (entry: { timestamp: string; line: string; stream: string }) => {
  const streamLabel = entry.stream === "stderr" ? "ERR" : "OUT";
  return `${entry.timestamp} [${streamLabel}] ${entry.line}`;
};

export const buildUi = (
  renderer: CliRenderer,
  manifest: Manifest,
  manager: ServiceManager,
): (() => void) => {
  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    backgroundColor: palette.bg,
    flexDirection: "column",
  });

  const header = new BoxRenderable(renderer, {
    height: 3,
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    paddingLeft: 1,
    paddingRight: 1,
    alignItems: "center",
    backgroundColor: palette.panel,
  });

  const title = new TextRenderable(renderer, {
    content: `stasium  ${manifest.path}`,
    fg: palette.text,
  });

  header.add(title);

  const main = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "row",
    gap: 1,
    padding: 1,
  });

  const servicePanel = new BoxRenderable(renderer, {
    width: "35%",
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    padding: 1,
    flexDirection: "column",
    backgroundColor: palette.panel,
    title: "services",
  });

  const listContainer = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexDirection: "column",
  });

  servicePanel.add(listContainer);

  const logPanel = new BoxRenderable(renderer, {
    flexGrow: 1,
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    padding: 1,
    flexDirection: "column",
    backgroundColor: palette.panel,
    title: "logs",
  });

  const logScroll = new ScrollBoxRenderable(renderer, {
    flexGrow: 1,
    viewportOptions: {
      backgroundColor: palette.panel,
    },
    contentOptions: {
      backgroundColor: palette.panel,
      flexDirection: "column",
      gap: 0,
    },
    scrollbarOptions: {
      showArrows: false,
      trackOptions: {
        foregroundColor: palette.accent,
        backgroundColor: palette.panel,
      },
    },
  });

  logPanel.add(logScroll);

  main.add(servicePanel);
  main.add(logPanel);

  const footer = new BoxRenderable(renderer, {
    height: 2,
    border: true,
    borderStyle: "single",
    borderColor: palette.border,
    paddingLeft: 1,
    paddingRight: 1,
    alignItems: "center",
    backgroundColor: palette.panel,
  });

  const footerText = new TextRenderable(renderer, {
    content: "s start  x stop  r restart  e edit  q quit  up/down select",
    fg: palette.muted,
  });

  footer.add(footerText);

  root.add(header);
  root.add(main);
  root.add(footer);
  renderer.root.add(root);

  let listLines: TextRenderable[] = [];
  let logLines: TextRenderable[] = [];
  let lastLogVersion = -1;
  let lastSelectedIndex = -1;

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
      const content = `${prefix} ${status} ${view.name}  exit:${exitCode}  restarts:${view.restartCount}`;
      const line = new TextRenderable(renderer, {
        id: `service-${index}`,
        content,
        fg: selected ? palette.text : stateColor(view.state),
      });
      listContainer.add(line);
      listLines.push(line);
    });
  };

  const rebuildLogs = (view: ServiceView | null) => {
    const version = view ? view.log.getVersion() : 0;
    const selectedIndex = manager.getSelectedIndex();
    if (version === lastLogVersion && selectedIndex === lastSelectedIndex) {
      return;
    }

    lastLogVersion = version;
    lastSelectedIndex = selectedIndex;

    for (const line of logLines) {
      logScroll.remove(line.id);
      line.destroy();
    }
    logLines = [];
    const entries = view ? view.log.all() : [];
    entries.forEach((entry, index) => {
      const content = formatLogLine(entry);
      const line = new TextRenderable(renderer, {
        id: `log-${lastLogVersion}-${index}`,
        content,
        fg: entry.stream === "stderr" ? palette.error : palette.text,
        wrapMode: "char",
      });
      logScroll.add(line);
      logLines.push(line);
    });
    logScroll.scrollTo({ x: 0, y: logScroll.scrollHeight });
  };

  const renderAll = () => {
    const views = manager.getViews();
    rebuildList(views, manager.getSelectedIndex());
    rebuildLogs(manager.getSelectedView());
    renderer.requestRender();
  };

  renderAll();
  const unsubscribe = manager.onUpdate(renderAll);
  return () => {
    unsubscribe();
    root.destroy();
  };
};
