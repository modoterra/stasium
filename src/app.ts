import { resolve } from "node:path";
import { type KeyEvent, createCliRenderer } from "@opentui/core";
import { DockerManager, detectComposeFile } from "./docker";
import { FocusManager } from "./focus";
import {
  DiscoverySelection,
  detectServices,
  finalizeSelection,
  formatServiceSummary,
  writeManifest,
} from "./init";
import { loadManifest, parseServiceBlock, renderServiceBlock, saveManifest } from "./manifest";
import { cleanupExistingPids, syncPidFiles } from "./pidfile";
import { getTopologicalServiceOrder } from "./service-graph";
import { ServiceManager } from "./service-manager";
import { fileExists, getErrorMessage } from "./shared";
import { createShutdownHandler } from "./shutdown";
import { type UiControls, buildInitUi, buildUi } from "./ui";

const MANIFEST_PATH = "stasium.toml";

type ShutdownController = {
  run: (reason?: string) => Promise<void>;
  install: () => void;
  uninstall: () => void;
};

const setupInitSelectionKeybindings = (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  selection: DiscoverySelection,
  onConfirm: () => Promise<void>,
) => {
  let creatingManifest = false;

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;

    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      return;
    }

    switch (key.name) {
      case "up":
        selection.moveCursor(-1);
        return;
      case "down":
        selection.moveCursor(1);
        return;
      case "space":
        selection.toggleCursor();
        return;
      case "a":
        selection.selectAll();
        return;
      case "n":
        selection.selectNone();
        return;
      case "enter":
      case "return": {
        if (creatingManifest) return;
        creatingManifest = true;
        try {
          await onConfirm();
        } finally {
          creatingManifest = false;
        }
        return;
      }
      case "q":
      case "escape":
        renderer.destroy();
        return;
      default:
        return;
    }
  });
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
  let discoverySelection: DiscoverySelection | null = null;
  let discoveryOpening = false;
  let discoveryApplying = false;
  const syncPids = async () => {
    await syncPidFiles(process.cwd(), manager.getServicePids(), {
      knownServices: manager.getConfigs().map((config) => config.name),
      logger: (message) => console.error(message),
    });
  };

  const closeDiscovery = () => {
    discoveryApplying = false;
    discoverySelection = null;
    controls.hideDiscoveryOverlay();
    focusManager.setMode("normal");
  };

  const openDiscovery = async () => {
    if (discoveryOpening) return;
    discoveryOpening = true;

    try {
      const detected = await detectServices(process.cwd());
      const selection = new DiscoverySelection(detected.candidates);
      discoverySelection = selection;
      focusManager.setMode("discovering");
      controls.showDiscoveryOverlay(selection, detected.warnings);
    } catch (error) {
      console.error(getErrorMessage(error));
    } finally {
      discoveryOpening = false;
    }
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
      case "i":
        await openDiscovery();
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
      case "f":
        controls.toggleLogsFollowTail();
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
      controls.clearEditError();
      const toml = controls.getEditContent();
      try {
        const config = parseServiceBlock(toml);
        const index = manager.getSelectedIndex();
        await manager.updateServiceConfig(index, config);
        await saveManifest(manifestPath, manager.getConfigs());
        await syncPids();
      } catch (error) {
        controls.setEditError(getErrorMessage(error));
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
      controls.clearAddError();
      const name = controls.getAddName().trim();
      const command = controls.getAddCommand().trim();
      if (!name || !command) {
        controls.setAddError("Name and command are required.");
        return;
      }

      try {
        await manager.addService({ name, command });
        await saveManifest(manifestPath, manager.getConfigs());
        await syncPids();
        controls.hideAddOverlay();
        focusManager.setMode("normal");
      } catch (error) {
        controls.setAddError(getErrorMessage(error));
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

  const handleDiscovering = async (key: KeyEvent) => {
    const selection = discoverySelection;
    if (!selection) {
      closeDiscovery();
      return;
    }

    if (key.name === "escape") {
      closeDiscovery();
      return;
    }

    switch (key.name) {
      case "up":
        selection.moveCursor(-1);
        return;
      case "down":
        selection.moveCursor(1);
        return;
      case "space":
        selection.toggleCursor();
        return;
      case "a":
        selection.selectAll();
        return;
      case "n":
        selection.selectNone();
        return;
      case "enter":
      case "return": {
        if (discoveryApplying) return;
        discoveryApplying = true;
        controls.clearDiscoveryError();

        try {
          const finalized = finalizeSelection(selection, {
            usedNames: manager.getConfigs().map((config) => config.name),
          });

          if (finalized.services.length === 0) {
            controls.setDiscoveryError("Select at least one service to add.");
            return;
          }

          const pendingByName = new Map(
            finalized.services.map((service) => [service.name, service]),
          );
          const orderedNames = getTopologicalServiceOrder([
            ...manager.getConfigs(),
            ...finalized.services,
          ]);

          for (const serviceName of orderedNames) {
            const service = pendingByName.get(serviceName);
            if (!service) continue;
            await manager.addService(service);
          }

          await saveManifest(manifestPath, manager.getConfigs());
          await syncPids();

          for (const warning of finalized.warnings) {
            console.error(`Discovery warning: ${warning}`);
          }

          closeDiscovery();
        } catch (error) {
          controls.setDiscoveryError(getErrorMessage(error));
        } finally {
          discoveryApplying = false;
        }
        return;
      }
      default:
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

  const handleQuit = async (reason: string): Promise<void> => {
    try {
      await shutdown.run(reason);
    } catch (error) {
      console.error(`Shutdown warning: ${getErrorMessage(error)}`);
    }

    if (dockerManager) {
      try {
        await dockerManager.destroy();
      } catch (error) {
        console.error(`Docker cleanup warning: ${getErrorMessage(error)}`);
      }
    }

    renderer.destroy();
  };

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;

    try {
      // Global: Ctrl+C always quits
      if (key.ctrl && key.name === "c") {
        await handleQuit("User requested shutdown.");
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

      if (mode === "discovering") {
        await handleDiscovering(key);
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
        await handleQuit("User requested shutdown.");
        return;
      }

      if (controls.isLogsPanelVisible()) {
        if (key.name === "home") {
          controls.scrollLogsToTop();
          return;
        }

        if (key.name === "end") {
          controls.scrollLogsToBottom();
          return;
        }

        if (key.name === "pageup" || key.name === "pgup") {
          controls.scrollLogsPage(-1);
          return;
        }

        if (key.name === "pagedown" || key.name === "pgdn") {
          controls.scrollLogsPage(1);
          return;
        }
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
    } catch (error) {
      console.error(getErrorMessage(error));
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
    const manifestPath = resolve(process.cwd(), MANIFEST_PATH);
    if (await fileExists(MANIFEST_PATH)) {
      console.error(`Manifest already exists: ${manifestPath}`);
      process.exitCode = 1;
      return;
    }

    const teardownRef: { current: (() => void) | null } = { current: null };

    try {
      const detected = await detectServices(process.cwd());
      const selection = new DiscoverySelection(detected.candidates);
      const renderer = await createCliRenderer({
        exitOnCtrlC: false,
        onDestroy: () => {
          teardownRef.current?.();
          teardownRef.current = null;
        },
      });

      teardownRef.current = buildInitUi(renderer, {
        selection,
        warnings: detected.warnings,
      });

      setupInitSelectionKeybindings(renderer, selection, async () => {
        try {
          const finalized = finalizeSelection(selection);
          await writeManifest(manifestPath, finalized.services);
          renderer.destroy();

          console.log(`Created ${manifestPath}`);
          if (finalized.services.length > 0) {
            console.log("Detected services:");
            for (const service of finalized.services) {
              console.log(`- ${formatServiceSummary(service)}`);
            }
          } else {
            console.log("No services selected. Edit stasium.toml to add services.");
          }

          const warnings = [...detected.warnings, ...finalized.warnings];
          if (warnings.length > 0) {
            console.log("Warnings:");
            for (const warning of warnings) {
              console.log(`- ${warning}`);
            }
          }
        } catch (error) {
          console.error(getErrorMessage(error));
          process.exitCode = 1;
          renderer.destroy();
        }
      });

      renderer.start();
    } catch (error) {
      console.error(getErrorMessage(error));
      process.exitCode = 1;
    }

    return;
  }

  const hasManifest = await fileExists(MANIFEST_PATH);
  const teardownRef: { current: (() => void) | null } = { current: null };
  const shutdownRef: { current: ShutdownController | null } = { current: null };

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    onDestroy: () => {
      const done = shutdownRef.current?.run("Renderer destroyed; shutting down services.");
      if (done) {
        void done.finally(() => {
          teardownRef.current?.();
          teardownRef.current = null;
        });
      } else {
        teardownRef.current?.();
        teardownRef.current = null;
      }
    },
  });

  if (hasManifest) {
    await startApp(renderer, teardownRef, shutdownRef);
    renderer.start();
    return;
  }

  // No manifest found — show the init TUI
  const detected = await detectServices(process.cwd());
  const selection = new DiscoverySelection(detected.candidates);
  const manifestPath = resolve(process.cwd(), MANIFEST_PATH);

  teardownRef.current = buildInitUi(renderer, {
    selection,
    warnings: detected.warnings,
  });

  setupInitSelectionKeybindings(renderer, selection, async () => {
    try {
      const finalized = finalizeSelection(selection);
      await writeManifest(manifestPath, finalized.services);
      teardownRef.current?.();
      teardownRef.current = null;
      await startApp(renderer, teardownRef, shutdownRef);
    } catch (error) {
      console.error(getErrorMessage(error));
      process.exitCode = 1;
      renderer.destroy();
    }
  });

  renderer.start();
};
