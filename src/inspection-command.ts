import { resolve } from "node:path";
import { stat } from "node:fs/promises";
import { detectServices, formatServiceSummary, type DetectResult } from "./init";
import { loadManifest } from "./manifest";
import { getErrorMessage } from "./shared";
import type { CommandContext, CommandResult } from "./cli";

export interface InspectionCommandOptions {
  cwd?: string;
  manifestPath?: string;
  detect?: (cwd: string) => Promise<DetectResult>;
  exists?: (path: string) => Promise<boolean>;
}

const resolveOptions = (options: InspectionCommandOptions) => ({
  cwd: options.cwd ?? process.cwd(),
  manifestPath: options.manifestPath ?? resolve(options.cwd ?? process.cwd(), "stasium.toml"),
  detect: options.detect ?? detectServices,
  exists: options.exists ?? pathExists,
});

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

export const runValidateCommand = async (
  _args: string[],
  context: CommandContext,
  options: InspectionCommandOptions = {},
): Promise<CommandResult> => {
  const resolved = resolveOptions(options);
  try {
    const manifest = await loadManifest(resolved.manifestPath);
    context.stdout(
      `Manifest is valid: ${manifest.services.length} Process Definition${manifest.services.length === 1 ? "" : "s"}.`,
    );
    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};

export const runDoctorCommand = async (
  _args: string[],
  context: CommandContext,
  options: InspectionCommandOptions = {},
): Promise<CommandResult> => {
  const resolved = resolveOptions(options);
  try {
    const manifest = await loadManifest(resolved.manifestPath);
    const problems: string[] = [];

    for (const processDefinition of manifest.services) {
      if (!(await resolved.exists(processDefinition.workingDir))) {
        problems.push(
          `${processDefinition.name}: working directory not found: ${processDefinition.workingDir}`,
        );
      }
    }

    if (problems.length === 0) {
      context.stdout("Project looks ready.");
      return { exitCode: 0 };
    }

    context.stderr("Project readiness problems:");
    for (const problem of problems) context.stderr(`- ${problem}`);
    return { exitCode: 1 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};

export const runDiscoverCommand = async (
  _args: string[],
  context: CommandContext,
  options: InspectionCommandOptions = {},
): Promise<CommandResult> => {
  const resolved = resolveOptions(options);
  try {
    const detected = await resolved.detect(resolved.cwd);
    if (detected.candidates.length === 0) {
      context.stdout("No Candidates discovered.");
    } else {
      context.stdout("Discovered Candidates:");
      for (const candidate of detected.candidates) {
        context.stdout(`- ${formatServiceSummary(candidate.service)}`);
      }
    }

    if (detected.warnings.length > 0) {
      context.stdout("Warnings:");
      for (const warning of detected.warnings) context.stdout(`- ${warning}`);
    }

    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};
