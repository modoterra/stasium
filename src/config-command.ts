import {
  defaultUpdatePreferencesPath,
  loadUpdatePreferences,
  saveUpdatePreferences,
} from "./update-preferences";
import type { CommandContext, CommandResult } from "./cli";

export interface ConfigCommandOptions {
  preferencesPath?: string;
}

const supportedKeys = ["update.channel", "update.enabled"];

const unsupportedKey = (context: CommandContext, key: string): CommandResult => {
  context.stderr(`Unsupported config key: ${key}. Supported keys: ${supportedKeys.join(", ")}.`);
  return { exitCode: 1 };
};

const parseBoolean = (value: string): boolean | null => {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
};

export const runConfigCommand = async (
  args: string[],
  context: CommandContext,
  options: ConfigCommandOptions = {},
): Promise<CommandResult> => {
  const [action, key, value] = args;
  const preferencesPath = options.preferencesPath ?? defaultUpdatePreferencesPath();

  if (action !== "get" && action !== "set") {
    context.stderr("Usage: stasium config <get|set> <key> [value]");
    return { exitCode: 1 };
  }
  if (!key) {
    context.stderr("Missing config key.");
    return { exitCode: 1 };
  }
  if (!supportedKeys.includes(key)) return unsupportedKey(context, key);

  const preferences = await loadUpdatePreferences(preferencesPath);

  if (action === "get") {
    if (value !== undefined) {
      context.stderr("Config get does not accept a value.");
      return { exitCode: 1 };
    }
    context.stdout(key === "update.channel" ? preferences.channel : String(preferences.enabled));
    return { exitCode: 0 };
  }

  if (value === undefined) {
    context.stderr(`Missing value for ${key}.`);
    return { exitCode: 1 };
  }

  if (key === "update.channel") {
    await saveUpdatePreferences({ ...preferences, channel: value }, preferencesPath);
    context.stdout(`Set update.channel to ${value}.`);
    return { exitCode: 0 };
  }

  const enabled = parseBoolean(value);
  if (enabled === null) {
    context.stderr("update.enabled must be true or false.");
    return { exitCode: 1 };
  }

  await saveUpdatePreferences({ ...preferences, enabled }, preferencesPath);
  context.stdout(`Set update.enabled to ${enabled}.`);
  return { exitCode: 0 };
};
