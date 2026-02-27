import type { CommandSpec } from "./types";

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
};

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const formatCommandSpec = (command: CommandSpec): string => {
  if (Array.isArray(command)) return command.join(" ");
  return command;
};
