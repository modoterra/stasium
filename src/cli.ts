export interface CommandContext {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

export interface CommandResult {
  exitCode: number;
}

export type CommandHandler = (args: string[], context: CommandContext) => Promise<CommandResult>;

export interface RunCommandOptions {
  argv: string[];
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  root: CommandHandler;
  commands?: Record<string, CommandHandler>;
  legacyRootCommands?: string[];
}

export const runCommand = async (options: RunCommandOptions): Promise<CommandResult> => {
  const [name, ...rest] = options.argv;
  const context: CommandContext = {
    stdout: options.stdout ?? console.log,
    stderr: options.stderr ?? console.error,
  };

  if (!name) return options.root([], context);

  const command = options.commands?.[name];
  if (command) return command(rest, context);

  if (options.legacyRootCommands?.includes(name)) return options.root(options.argv, context);

  context.stderr(`Unknown command: ${name}`);
  return { exitCode: 1 };
};
