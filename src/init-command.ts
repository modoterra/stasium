import { resolve } from "node:path";
import { DiscoverySelection, detectServices, formatServiceSummary } from "./init";
import { createProjectManifest, type ProjectSetupResult } from "./project-setup";
import { fileExists, getErrorMessage } from "./shared";
import type { CommandContext, CommandResult } from "./cli";

export interface InitYesCommandOptions {
  cwd?: string;
  manifestPath?: string;
  hasManifest?: (path: string) => Promise<boolean>;
  detect?: typeof detectServices;
  createManifest?: (
    manifestPath: string,
    selection: DiscoverySelection,
  ) => Promise<ProjectSetupResult>;
}

export const runInitYesCommand = async (
  context: CommandContext,
  options: InitYesCommandOptions = {},
): Promise<CommandResult> => {
  const cwd = options.cwd ?? process.cwd();
  const manifestPath = options.manifestPath ?? resolve(cwd, "stasium.toml");
  const hasManifest = options.hasManifest ?? fileExists;

  if (await hasManifest(manifestPath)) {
    context.stderr(`Manifest already exists: ${manifestPath}`);
    return { exitCode: 1 };
  }

  try {
    const detected = await (options.detect ?? detectServices)(cwd);
    const selection = new DiscoverySelection(detected.candidates);
    const finalized = await (options.createManifest ?? createProjectManifest)(
      manifestPath,
      selection,
    );

    context.stdout(`Created ${manifestPath}`);
    if (finalized.services.length > 0) {
      context.stdout("Detected services:");
      for (const service of finalized.services)
        context.stdout(`- ${formatServiceSummary(service)}`);
    } else {
      context.stdout("No services selected. Edit stasium.toml to add services.");
    }

    const warnings = [...detected.warnings, ...finalized.warnings];
    if (warnings.length > 0) {
      context.stdout("Warnings:");
      for (const warning of warnings) context.stdout(`- ${warning}`);
    }

    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};
