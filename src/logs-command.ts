import { resolve } from "node:path";
import { loadManifest } from "./manifest";
import { ProcessOutputStore } from "./process-output-store";
import { getErrorMessage } from "./shared";
import type { CommandContext, CommandResult } from "./cli";

export interface LogsCommandOptions {
  cwd?: string;
  manifestPath?: string;
  outputStore?: Pick<ProcessOutputStore, "read" | "follow">;
}

export const runLogsCommand = async (
  args: string[],
  context: CommandContext,
  options: LogsCommandOptions = {},
): Promise<CommandResult> => {
  const [name, ...rest] = args;
  const follow = rest.includes("--follow");
  const unknown = rest.filter((arg) => arg !== "--follow");
  if (!name || unknown.length > 0) {
    context.stderr("Usage: stasium logs <managed-process-name> [--follow]");
    return { exitCode: 1 };
  }

  const cwd = options.cwd ?? process.cwd();
  const manifestPath = options.manifestPath ?? resolve(cwd, "stasium.toml");
  const outputStore = options.outputStore ?? new ProcessOutputStore(cwd);

  try {
    const manifest = await loadManifest(manifestPath);
    if (!manifest.services.some((processDefinition) => processDefinition.name === name)) {
      context.stderr(`Unknown Managed Process: ${name}`);
      return { exitCode: 1 };
    }

    if (follow) {
      for await (const chunk of outputStore.follow(name)) {
        if (chunk.length > 0) context.stdout(chunk.trimEnd());
      }
      return { exitCode: 0 };
    }

    const output = await outputStore.read(name);
    if (!output || output.trim().length === 0) {
      context.stdout(`No Process Output available for ${name}.`);
    } else {
      context.stdout(output.trimEnd());
    }
    return { exitCode: 0 };
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }
};
