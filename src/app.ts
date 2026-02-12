import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { loadManifest } from "./manifest";
import { ServiceManager } from "./service-manager";
import { buildUi } from "./ui";
import { formatServiceSummary, initProject } from "./init";

const MANIFEST_PATH = "stasium.toml";

const shutdown = async (
  renderer: Awaited<ReturnType<typeof createCliRenderer>>,
  manager: ServiceManager,
) => {
  await manager.stopAll();
  const clean = await manager.waitForExit(1500);
  if (!clean) {
    await manager.forceStopAll();
  }
  renderer.destroy();
};

export const run = async () => {
  const args = process.argv.slice(2);
  if (args[0] === "init") {
    try {
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

  const manifest = await loadManifest(MANIFEST_PATH);
  const manager = new ServiceManager(manifest.services);
  let teardownUi: (() => void) | null = null;
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    onDestroy: () => {
      teardownUi?.();
    },
  });

  teardownUi = buildUi(renderer, manifest, manager);

  renderer.keyInput.on("keypress", async (key: KeyEvent) => {
    if (key.eventType === "release") return;
    if (key.ctrl && key.name === "c") {
      await shutdown(renderer, manager);
      return;
    }

    switch (key.name) {
      case "q":
        await shutdown(renderer, manager);
        break;
      case "escape":
        await shutdown(renderer, manager);
        break;
      case "s":
        await manager.startSelected();
        break;
      case "x":
        await manager.stopSelected();
        break;
      case "r":
        await manager.restartSelected();
        break;
      case "e":
        // MVP: editor not implemented
        break;
      case "up":
        manager.moveSelection(-1);
        break;
      case "down":
        manager.moveSelection(1);
        break;
      default:
        break;
    }
  });

  await manager.startAll();
  renderer.start();
};
