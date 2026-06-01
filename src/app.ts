import { resolve } from "node:path";
import { type KeyEvent, createCliRenderer } from "@opentui/core";
import type { ExternalRuntimeVisibilityManager } from "./external-runtime";
import { FocusManager } from "./focus";
import { DiscoverySelection, detectServices, formatServiceSummary } from "./init";
import {
  addProcessDefinition,
  addSelectedDiscoveryCandidates,
  removeSelectedProcessDefinition,
  replaceProcessDefinition,
} from "./manifest-editing";
import { renderServiceBlock } from "./manifest";
import { ProcessClaimStore } from "./process-claim";
import { createProjectManifest } from "./project-setup";
import { ServiceManager } from "./service-manager";
import { fileExists, getErrorMessage } from "./shared";
import { currentUpdatePlatform, runStartupUpdateCheck } from "./startup-update";
import type { AppConfig, Manifest, Shortcut } from "./types";
import { type UiControls, buildInitUi, buildUi } from "./ui";
import { STASIUM_VERSION } from "./version";
import { startWorkspace, type ShutdownController } from "./workspace-startup";

const MANIFEST_PATH = "stasium.toml";

type AppRuntime = {
  disposed: boolean;
  closing: boolean;
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null;
  exitCode: number | null;
};

type MainUiSession = {
  teardown: () => void;
  controls: UiControls;
  focusManager: FocusManager;
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null;
};

const setupInitSelectionKeybindings = (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  getSelection: () => DiscoverySelection,
  isLoading: () => boolean,
  onQuit: () => void,
  onConfirm: () => Promise<void>,
) => {
  let creatingManifest = false;

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;

    if (key.ctrl && key.name === "c") {
      onQuit();
      return;
    }

    switch (key.name) {
      case "up":
        getSelection().moveCursor(-1);
        return;
      case "down":
        getSelection().moveCursor(1);
        return;
      case "space":
        getSelection().toggleCursor();
        return;
      case "a":
        getSelection().selectAll();
        return;
      case "n":
        getSelection().selectNone();
        return;
      case "enter":
      case "return": {
        if (creatingManifest || isLoading()) return;
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
        onQuit();
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
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null,
  controls: UiControls,
  manifestPath: string,
  appConfig: AppConfig | undefined,
  runtime: AppRuntime,
  shutdown: ShutdownController,
  processClaimStore: ProcessClaimStore,
) => {
  let deleteConfirming = false;
  let discoverySelection: DiscoverySelection | null = null;
  let discoveryOpening = false;
  let discoveryApplying = false;
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
        controls.moveLogSelection(-1);
        break;
      case "down":
        controls.moveLogSelection(1);
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

  const handleNormalExternalRuntime = async (key: KeyEvent) => {
    if (!externalRuntimeManager) return;
    switch (key.name) {
      case "s":
        await externalRuntimeManager.startSelected();
        break;
      case "x":
        await externalRuntimeManager.stopSelected();
        break;
      case "r":
        await externalRuntimeManager.restartSelected();
        break;
      case "up":
        externalRuntimeManager.moveSelection(-1);
        break;
      case "down":
        externalRuntimeManager.moveSelection(1);
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
        await replaceProcessDefinition(
          { manifestPath, appConfig, manager, processClaimStore, externalRuntimeManager },
          manager.getSelectedIndex(),
          toml,
        );
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
        await addProcessDefinition(
          { manifestPath, appConfig, manager, processClaimStore, externalRuntimeManager },
          { name, launchInstruction: command },
        );
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
          const previousCount = manager.getConfigs().length;
          const result = await addSelectedDiscoveryCandidates(
            { manifestPath, appConfig, manager, processClaimStore, externalRuntimeManager },
            selection,
          );

          if (result.services.length === previousCount) {
            controls.setDiscoveryError("Select at least one service to add.");
            return;
          }

          for (const warning of result.warnings) {
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
      await removeSelectedProcessDefinition({
        manifestPath,
        appConfig,
        manager,
        processClaimStore,
        externalRuntimeManager,
      });
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

  const triggerManifestShortcut = async (shortcut: Shortcut): Promise<void> => {
    switch (shortcut.label) {
      case "start":
        await manager.startSelected();
        return;
      case "stop":
        await manager.stopSelected();
        return;
      case "restart":
        await manager.restartSelected();
        return;
      case "add":
        focusManager.setMode("adding");
        controls.showAddOverlay();
        return;
      case "discover":
        await openDiscovery();
        return;
      case "delete": {
        const view = manager.getSelectedView();
        if (!view) return;
        deleteConfirming = true;
        controls.showDeleteConfirm(view.name);
        return;
      }
      case "edit": {
        const config = manager.getSelectedConfig();
        if (!config) return;
        focusManager.setMode("editing");
        controls.showEditOverlay(renderServiceBlock(config));
        return;
      }
      case "select":
        manager.moveSelection(1);
        return;
      default:
        return;
    }
  };

  const triggerLogsShortcut = async (shortcut: Shortcut): Promise<void> => {
    switch (shortcut.label) {
      case "select":
        controls.moveLogSelection(1);
        return;
      case "follow":
        controls.toggleLogsFollowTail();
        return;
      case "top":
        controls.scrollLogsToTop();
        return;
      case "bottom":
        controls.scrollLogsToBottom();
        return;
      case "clear":
        controls.clearLogs();
        return;
      default:
        return;
    }
  };

  const triggerExternalRuntimeShortcut = async (shortcut: Shortcut): Promise<void> => {
    if (!externalRuntimeManager) return;
    switch (shortcut.label) {
      case "start":
        await externalRuntimeManager.startSelected();
        return;
      case "stop":
        await externalRuntimeManager.stopSelected();
        return;
      case "restart":
        await externalRuntimeManager.restartSelected();
        return;
      case "select":
        externalRuntimeManager.moveSelection(1);
        return;
      default:
        return;
    }
  };

  const triggerShortcut = async (shortcut: Shortcut): Promise<void> => {
    if (focusManager.getMode() !== "normal" || deleteConfirming) return;

    switch (shortcut.label) {
      case "manifest panel":
        focusManager.togglePanel("manifest");
        return;
      case "docker panel":
        focusManager.togglePanel("docker");
        return;
      case "logs panel":
        focusManager.togglePanel("logs");
        return;
      case "all panels":
        focusManager.showAllPanels();
        return;
      case "switch panel":
        focusManager.cyclePanel();
        return;
      case "quit":
        await handleQuit("User requested shutdown.");
        return;
      case "log page":
        if (controls.isLogsPanelVisible()) controls.scrollLogsPage(1);
        return;
      case "log jump":
        if (controls.isLogsPanelVisible()) controls.scrollLogsToBottom();
        return;
      default:
        break;
    }

    const panel = focusManager.getActivePanel();
    if (panel === "manifest") {
      await triggerManifestShortcut(shortcut);
      return;
    }

    if (panel === "logs") {
      await triggerLogsShortcut(shortcut);
      return;
    }

    if (panel === "docker") {
      await triggerExternalRuntimeShortcut(shortcut);
    }
  };

  controls.setShortcutHandler((shortcut) => {
    void triggerShortcut(shortcut).catch((error) => {
      console.error(getErrorMessage(error));
    });
  });

  const handleLayoutKey = (keyName: string): boolean => {
    switch (keyName) {
      case "1":
        focusManager.togglePanel("manifest");
        return true;
      case "2":
        if (externalRuntimeManager) {
          focusManager.togglePanel("docker");
          return true;
        }
        return false;
      case "3":
        focusManager.togglePanel("logs");
        return true;
      case "4":
        focusManager.showAllPanels();
        return true;
      default:
        return false;
    }
  };

  const handleQuit = async (reason: string): Promise<void> => {
    runtime.closing = true;
    runtime.exitCode = runtime.exitCode ?? 0;

    try {
      await shutdown.run(reason);
    } catch (error) {
      console.error(`Shutdown warning: ${getErrorMessage(error)}`);
    }

    const activeExternalRuntimeManager = runtime.externalRuntimeManager ?? externalRuntimeManager;
    if (activeExternalRuntimeManager) {
      try {
        await activeExternalRuntimeManager.destroy();
      } catch (error) {
        console.error(`External Runtime cleanup warning: ${getErrorMessage(error)}`);
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

      if (handleLayoutKey(key.name)) {
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
        await handleNormalExternalRuntime(key);
        return;
      }
    } catch (error) {
      console.error(getErrorMessage(error));
    }
  });
};

const mountMainUiSession = (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  teardownRef: { current: (() => void) | null },
  runtime: AppRuntime,
  shutdown: ShutdownController,
  manifestPath: string,
  manager: ServiceManager,
  manifest: Manifest,
  appConfig: AppConfig | undefined,
  externalRuntimeManager: ExternalRuntimeVisibilityManager | null,
  processClaimStore: ProcessClaimStore,
): MainUiSession => {
  const focusManager = new FocusManager(externalRuntimeManager !== null);
  const { teardown, controls } = buildUi({
    renderer,
    manifest,
    manager,
    focusManager,
    dockerManager: externalRuntimeManager,
  });

  teardownRef.current = teardown;
  runtime.externalRuntimeManager = externalRuntimeManager;

  renderer.keyInput.removeAllListeners("keypress");
  setupKeybindings(
    renderer,
    manager,
    focusManager,
    externalRuntimeManager,
    controls,
    manifestPath,
    appConfig,
    runtime,
    shutdown,
    processClaimStore,
  );

  controls.renderAll();

  return {
    teardown,
    controls,
    focusManager,
    externalRuntimeManager,
  };
};

const startApp = async (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  teardownRef: { current: (() => void) | null },
  shutdownRef: { current: ShutdownController | null },
  runtime: AppRuntime,
) => {
  const manifestPath = resolve(process.cwd(), MANIFEST_PATH);
  shutdownRef.current?.uninstall();

  await startWorkspace({
    cwd: process.cwd(),
    manifestPath,
    runtime,
    logger: (message) => console.error(message),
    onShutdownReady: (shutdown) => {
      shutdownRef.current = shutdown;
    },
    mountWorkspace: ({
      manifest,
      appConfig,
      manager,
      processClaimStore,
      externalRuntimeManager,
      shutdown,
    }) => {
      mountMainUiSession(
        renderer,
        teardownRef,
        runtime,
        shutdown,
        manifestPath,
        manager,
        manifest,
        appConfig,
        externalRuntimeManager,
        processClaimStore,
      );
    },
  });
};

const startInitFlow = (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  teardownRef: { current: (() => void) | null },
  runtime: AppRuntime,
  onConfirm: (selection: DiscoverySelection, warnings: string[]) => Promise<void>,
) => {
  const selectionRef = { current: new DiscoverySelection([]) };
  const warningsRef: { current: string[] } = { current: [] };

  const { teardown: baseTeardown, controls } = buildInitUi(renderer, {
    selection: selectionRef.current,
    warnings: [],
    loading: true,
  });

  const flowState = { disposed: false };
  const teardown = () => {
    if (flowState.disposed) return;
    flowState.disposed = true;
    baseTeardown();
  };

  const quitInitFlow = () => {
    runtime.closing = true;
    runtime.exitCode = runtime.exitCode ?? 0;
    renderer.destroy();
  };

  teardownRef.current = teardown;
  renderer.keyInput.removeAllListeners("keypress");
  setupInitSelectionKeybindings(
    renderer,
    () => selectionRef.current,
    () => controls.isLoading(),
    quitInitFlow,
    async () => {
      await onConfirm(selectionRef.current, warningsRef.current);
    },
  );

  void (async () => {
    try {
      const detected = await detectServices(process.cwd());
      if (flowState.disposed || runtime.disposed || runtime.closing) return;

      selectionRef.current = new DiscoverySelection(detected.candidates);
      warningsRef.current = [...detected.warnings];
      controls.setSelection(selectionRef.current);
      controls.setWarnings(warningsRef.current);
      controls.clearError();
      controls.setLoading(false);
    } catch (error) {
      if (flowState.disposed || runtime.disposed || runtime.closing) return;
      warningsRef.current = [];
      controls.setWarnings([]);
      controls.setError(getErrorMessage(error));
      controls.setLoading(false);
    }
  })();
};

export const run = async () => {
  const args = process.argv.slice(2);
  const hasManifest = await fileExists(MANIFEST_PATH);
  const teardownRef: { current: (() => void) | null } = { current: null };
  const shutdownRef: { current: ShutdownController | null } = { current: null };
  const runtime: AppRuntime = {
    disposed: false,
    closing: false,
    externalRuntimeManager: null,
    exitCode: null,
  };

  const updateResult = await runStartupUpdateCheck({
    currentVersion: STASIUM_VERSION,
    executablePath: process.argv[0] ?? process.execPath,
    platform: currentUpdatePlatform(),
  });
  for (const message of updateResult.messages) {
    console.error(message);
  }

  if (args[0] === "init") {
    const manifestPath = resolve(process.cwd(), MANIFEST_PATH);
    if (hasManifest) {
      console.error(`Manifest already exists: ${manifestPath}`);
      process.exitCode = 1;
      return;
    }

    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      useMouse: true,
      enableMouseMovement: true,
      onDestroy: () => {
        runtime.disposed = true;
        runtime.closing = true;
        teardownRef.current?.();
        teardownRef.current = null;

        if (runtime.exitCode !== null) {
          process.exitCode = runtime.exitCode;
          process.exit(runtime.exitCode);
        }
      },
    });

    startInitFlow(renderer, teardownRef, runtime, async (selection, warnings) => {
      try {
        const finalized = await createProjectManifest(manifestPath, selection);
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

        const allWarnings = [...warnings, ...finalized.warnings];
        if (allWarnings.length > 0) {
          console.log("Warnings:");
          for (const warning of allWarnings) {
            console.log(`- ${warning}`);
          }
        }
      } catch (error) {
        console.error(getErrorMessage(error));
        process.exitCode = 1;
        runtime.exitCode = 1;
        renderer.destroy();
      }
    });

    renderer.start();
    return;
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: true,
    enableMouseMovement: true,
    onDestroy: () => {
      runtime.disposed = true;
      runtime.closing = true;

      const finishCleanup = async () => {
        if (runtime.externalRuntimeManager) {
          try {
            await runtime.externalRuntimeManager.destroy();
          } catch (error) {
            console.error(`External Runtime cleanup warning: ${getErrorMessage(error)}`);
          } finally {
            runtime.externalRuntimeManager = null;
          }
        }

        teardownRef.current?.();
        teardownRef.current = null;

        if (runtime.exitCode !== null) {
          process.exitCode = runtime.exitCode;
          process.exit(runtime.exitCode);
        }
      };

      const done = shutdownRef.current?.run("Renderer destroyed; shutting down services.");
      if (done) {
        void done.finally(() => {
          void finishCleanup();
        });
      } else {
        void finishCleanup();
      }
    },
  });

  if (hasManifest) {
    await startApp(renderer, teardownRef, shutdownRef, runtime);
    renderer.start();
    return;
  }

  const manifestPath = resolve(process.cwd(), MANIFEST_PATH);
  startInitFlow(renderer, teardownRef, runtime, async (selection) => {
    try {
      teardownRef.current?.();
      teardownRef.current = null;
      await createProjectManifest(manifestPath, selection);
      await startApp(renderer, teardownRef, shutdownRef, runtime);
    } catch (error) {
      console.error(getErrorMessage(error));
      process.exitCode = 1;
      runtime.exitCode = 1;
      renderer.destroy();
    }
  });

  renderer.start();
};
