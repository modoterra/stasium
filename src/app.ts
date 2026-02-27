import { resolve } from "node:path";
import { type KeyEvent, createCliRenderer } from "@opentui/core";
import { DockerManager, detectComposeFile } from "./docker";
import { FocusManager } from "./focus";
import { detectServices, writeManifest } from "./init";
import { loadManifest, parseServiceBlock, renderServiceBlock, saveManifest } from "./manifest";
import { cleanupExistingPids, syncPidFiles } from "./pidfile";
import { ServiceManager } from "./service-manager";
import { createShutdownHandler } from "./shutdown";
import { type UiControls, buildInitUi, buildUi } from "./ui";

const MANIFEST_PATH = "stasium.toml";

type ShutdownController = {
  run: (reason?: string) => Promise<void>;
  install: () => void;
  uninstall: () => void;
};

const manifestExists = async (path: string): Promise<boolean> => {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
};

const setupKeybindings = (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  manager: ServiceManager,
  focusManager: FocusManager,
  dockerManager: DockerManager | null,
  controls: UiControls,
  manifestPath: string,
  shutdown: ShutdownController,
) => {
  let deleteConfirming = false;
  const syncPids = async () => {
    await syncPidFiles(process.cwd(), manager.getServicePids(), {
      knownServices: manager.getConfigs().map((config) => config.name),
      logger: (message) => console.error(message),
    });
  };

  const handleNormalManifest = async (key: KeyEvent) => {
    switch (key.name) {
      case "s":
        await manager.startSelected();
        break;
      case "x":
        await manager.stopSelected();
        break;
      case "r":
        await manager.restartSelected();
        break;
      case "a":
        focusManager.setMode("adding");
        controls.showAddOverlay();
        break;
      case "d": {
        const view = manager.getSelectedView();
        if (view) {
          deleteConfirming = true;
          controls.showDeleteConfirm(view.name);
        }
        break;
      }
      case "e": {
        const config = manager.getSelectedConfig();
        if (config) {
          const toml = renderServiceBlock(config);
          focusManager.setMode("editing");
          controls.showEditOverlay(toml);
        }
        break;
      }
      case "up":
        manager.moveSelection(-1);
        break;
      case "down":
        manager.moveSelection(1);
        break;
      default:
        break;
    }
  };

  const handleNormalLogs = (key: KeyEvent) => {
    // Shift+G (capital G) = scroll to bottom, must check before lowercase g
    if (key.name === "g" && key.shift) {
      controls.scrollLogsToBottom();
      return;
    }

    switch (key.name) {
      case "pageup":
      case "pgup":
        controls.scrollLogsPage(-1);
        break;
      case "pagedown":
      case "pgdn":
        controls.scrollLogsPage(1);
        break;
      case "up":
        controls.scrollLogs(-3);
        break;
      case "down":
        controls.scrollLogs(3);
        break;
      case "g":
        controls.scrollLogsToTop();
        break;
      case "c":
        controls.clearLogs();
        break;
      default:
        break;
    }
  };

  const handleNormalDocker = async (key: KeyEvent) => {
    if (!dockerManager) return;
    switch (key.name) {
      case "s":
        await dockerManager.startSelected();
        break;
      case "x":
        await dockerManager.stopSelected();
        break;
      case "r":
        await dockerManager.restartSelected();
        break;
      case "up":
        dockerManager.moveSelection(-1);
        break;
      case "down":
        dockerManager.moveSelection(1);
        break;
      default:
        break;
    }
  };

  const handleEditing = async (key: KeyEvent) => {
    if (key.ctrl && key.name === "s") {
      const toml = controls.getEditContent();
      try {
        const config = parseServiceBlock(toml);
        const index = manager.getSelectedIndex();
        await manager.updateServiceConfig(index, config);
        await saveManifest(manifestPath, manager.getConfigs());
        await syncPids();
      } catch {
        // invalid TOML — stay in editing mode
        return;
      }
      controls.hideEditOverlay();
      focusManager.setMode("normal");
      return;
    }

    if (key.name === "escape") {
      controls.hideEditOverlay();
      focusManager.setMode("normal");
      return;
    }
  };

  const handleAdding = async (key: KeyEvent) => {
    if (key.name === "enter" || key.name === "return") {
      const name = controls.getAddName().trim();
      const command = controls.getAddCommand().trim();
      if (name && command) {
        await manager.addService({ name, command });
        await saveManifest(manifestPath, manager.getConfigs());
        await syncPids();
        controls.hideAddOverlay();
        focusManager.setMode("normal");
      }
      return;
    }

    if (key.name === "tab") {
      controls.cycleAddFocus();
      return;
    }

    if (key.name === "escape") {
      controls.hideAddOverlay();
      focusManager.setMode("normal");
      return;
    }
  };

  const handleDeleteConfirm = async (key: KeyEvent) => {
    if (key.name === "y") {
      await manager.removeSelected();
      await saveManifest(manifestPath, manager.getConfigs());
      await syncPids();
      deleteConfirming = false;
      controls.hideDeleteConfirm();
      return;
    }

    if (key.name === "n" || key.name === "escape") {
      deleteConfirming = false;
      controls.hideDeleteConfirm();
      return;
    }
  };

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;

    // Global: Ctrl+C always quits
    if (key.ctrl && key.name === "c") {
      await shutdown.run("User requested shutdown.");
      if (dockerManager) {
        await dockerManager.destroy();
      }
      renderer.destroy();
      return;
    }

    const mode = focusManager.getMode();

    if (mode === "editing") {
      await handleEditing(key);
      return;
    }

    if (mode === "adding") {
      await handleAdding(key);
      return;
    }

    // Normal mode
    if (deleteConfirming) {
      await handleDeleteConfirm(key);
      return;
    }

    // Global normal shortcuts
    if (key.name === "tab") {
      focusManager.cyclePanel();
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      await shutdown.run("User requested shutdown.");
      if (dockerManager) {
        await dockerManager.destroy();
      }
      renderer.destroy();
      return;
    }

    // Panel-specific shortcuts
    const panel = focusManager.getActivePanel();

    if (panel === "manifest") {
      await handleNormalManifest(key);
      return;
    }

    if (panel === "logs") {
      handleNormalLogs(key);
      return;
    }

    if (panel === "docker") {
      await handleNormalDocker(key);
      return;
    }
  });
};

const startApp = async (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  teardownRef: { current: (() => void) | null },
  shutdownRef: { current: ShutdownController | null },
) => {
  const manifest = await loadManifest(MANIFEST_PATH);
  const manager = new ServiceManager(manifest.services);
  const manifestPath = resolve(process.cwd(), MANIFEST_PATH);

  await cleanupExistingPids(process.cwd(), {
    logger: (message) => console.error(message),
    knownServices: manifest.services.map((service) => service.name),
  });

  shutdownRef.current?.uninstall();
  const shutdown = createShutdownHandler({
    cwd: process.cwd(),
    manager,
    getServicePids: () => manager.getServicePids(),
    logger: (message) => console.error(message),
  });
  shutdown.install();
  shutdownRef.current = shutdown;

  manager.onProcessChange(() => {
    void syncPidFiles(process.cwd(), manager.getServicePids(), {
      knownServices: manager.getConfigs().map((config) => config.name),
      logger: (message) => console.error(message),
    });
  });

  // Detect Docker Compose
  const composePath = await detectComposeFile(process.cwd());
  const dockerManager = composePath ? new DockerManager(composePath) : null;
  const hasDocker = dockerManager !== null;

  const focusManager = new FocusManager(hasDocker);

  const { teardown, controls } = buildUi({
    renderer,
    manifest,
    manager,
    focusManager,
    dockerManager,
  });

  teardownRef.current = teardown;

  renderer.keyInput.removeAllListeners("keypress");
  setupKeybindings(
    renderer,
    manager,
    focusManager,
    dockerManager,
    controls,
    manifestPath,
    shutdown,
  );

  if (dockerManager) {
    dockerManager.startPolling();
  }

  await manager.startAll();
  await syncPidFiles(process.cwd(), manager.getServicePids(), {
    knownServices: manager.getConfigs().map((config) => config.name),
    logger: (message) => console.error(message),
  });
  renderer.requestRender();
};

export const run = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "init") {
    try {
      const { initProject, formatServiceSummary } = await import("./init");
      const result = await initProject(process.cwd(), MANIFEST_PATH);
      console.log(`Created ${result.manifestPath}`);
      if (result.services.length > 0) {
        console.log("Detected services:");
        for (const service of result.services) {
          console.log(`- ${formatServiceSummary(service)}`);
        }
      } else {
        console.log("No services detected. Edit stasium.toml to add services.");
      }
      if (result.warnings.length > 0) {
        console.log("Warnings:");
        for (const warning of result.warnings) {
          console.log(`- ${warning}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    }
    return;
  }

  const hasManifest = await manifestExists(MANIFEST_PATH);
  const teardownRef: { current: (() => void) | null } = { current: null };
  const shutdownRef: { current: ShutdownController | null } = { current: null };

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    onDestroy: () => {
      shutdownRef.current?.uninstall();
      teardownRef.current?.();
    },
  });

  if (hasManifest) {
    await startApp(renderer, teardownRef, shutdownRef);
    renderer.start();
    return;
  }

  // No manifest found — show the init TUI
  const detected = await detectServices(process.cwd());
  const manifestPath = resolve(process.cwd(), MANIFEST_PATH);

  teardownRef.current = buildInitUi(renderer, detected);

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      return;
    }

    switch (key.name) {
      case "enter":
      case "return": {
        await writeManifest(manifestPath, detected.services);
        teardownRef.current?.();
        teardownRef.current = null;
        await startApp(renderer, teardownRef, shutdownRef);
        break;
      }
      case "q":
      case "escape":
        renderer.destroy();
        break;
      default:
        break;
    }
  });

  renderer.start();
};
