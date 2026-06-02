import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { UpdateChannelName } from "./update-channel";

export interface UpdatePreferences {
  enabled: boolean;
  channel: UpdateChannelName;
}

export const defaultUpdatePreferences: UpdatePreferences = {
  enabled: true,
  channel: "stable",
};

export const defaultUpdatePreferencesPath = (home = process.env.HOME ?? process.cwd()): string =>
  join(home, ".config", "stasium", "update.json");

export const loadUpdatePreferences = async (
  path = defaultUpdatePreferencesPath(),
): Promise<UpdatePreferences> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return { ...defaultUpdatePreferences };

  const parsed = JSON.parse(await file.text()) as Partial<UpdatePreferences>;
  return {
    enabled: parsed.enabled ?? defaultUpdatePreferences.enabled,
    channel: parsed.channel ?? defaultUpdatePreferences.channel,
  };
};

export const saveUpdatePreferences = async (
  preferences: UpdatePreferences,
  path = defaultUpdatePreferencesPath(),
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(preferences, null, 2)}\n`);
};
