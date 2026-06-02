export interface CommandContext {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CommandResult {
  exitCode: number;
}

export type CommandHandler = (args: string[], context: CommandContext) => Promise<CommandResult>;

export interface CommandDefinition {
  description: string;
  usage: string;
  handler: CommandHandler;
}

export interface RunCommandOptions {
  argv: string[];
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  root: CommandHandler;
  rootUsage?: string;
  rootDescription?: string;
  version?: string;
  commands?: Record<string, CommandHandler | CommandDefinition>;
  legacyRootCommands?: string[];
}

const normalizeCommand = (
  name: string,
  command: CommandHandler | CommandDefinition,
): CommandDefinition => {
  if (typeof command === "function") {
    return { usage: `stasium ${name}`, description: "", handler: command };
  }
  return command;
};

const buildRootHelp = (options: RunCommandOptions): string => {
  const lines = [
    options.rootUsage ?? "Usage: stasium [command]",
    "",
    options.rootDescription ??
      "Run Stasium's interactive Workspace, or start Project Setup when no Manifest exists.",
  ];

  const entries = Object.entries(options.commands ?? {});
  if (entries.length > 0) {
    lines.push("", "Commands:");
    for (const [name, command] of entries) {
      const definition = normalizeCommand(name, command);
      lines.push(`  ${name}${definition.description ? `  ${definition.description}` : ""}`);
    }
  }

  return lines.join("\n");
};

const buildCommandHelp = (name: string, command: CommandDefinition): string =>
  command.description ? `${command.usage}\n\n${command.description}` : command.usage;

export const runCommand = async (options: RunCommandOptions): Promise<CommandResult> => {
  const [name, ...rest] = options.argv;
  const context: CommandContext = {
    stdout: options.stdout ?? console.log,
    stderr: options.stderr ?? console.error,
  };

  if (!name) return options.root([], context);

  if (name === "--help" || name === "-h") {
    context.stdout(buildRootHelp(options));
    return { exitCode: 0 };
  }

  if ((name === "--version" || name === "-v") && options.version) {
    context.stdout(options.version);
    return { exitCode: 0 };
  }

  if (name === "help") {
    const [target] = rest;
    if (!target) {
      context.stdout(buildRootHelp(options));
      return { exitCode: 0 };
    }

    const command = options.commands?.[target];
    if (!command) {
      context.stderr(`Unknown command: ${target}`);
      return { exitCode: 1 };
    }

    context.stdout(buildCommandHelp(target, normalizeCommand(target, command)));
    return { exitCode: 0 };
  }

  const command = options.commands?.[name];
  if (command) {
    const definition = normalizeCommand(name, command);
    if (rest[0] === "--help" || rest[0] === "-h") {
      context.stdout(buildCommandHelp(name, definition));
      return { exitCode: 0 };
    }
    return definition.handler(rest, context);
  }

  if (options.legacyRootCommands?.includes(name)) return options.root(options.argv, context);

  context.stderr(`Unknown command: ${name}. Run "stasium --help" for usage.`);
  return { exitCode: 1 };
};
