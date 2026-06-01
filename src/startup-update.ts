import {
  defaultSelfUpdateTempDir,
  SelfUpdateInstaller,
  type SelfUpdateResult,
} from "./self-update";
import { GitHubUpdateChannel } from "./github-update-channel";
import { defaultUpdatePreferencesPath, loadUpdatePreferences } from "./update-preferences";
import type { UpdateDecision, UpdatePlatform } from "./update-channel";
import { getErrorMessage } from "./shared";

export interface StartupUpdateCheckOptions {
  currentVersion: string;
  executablePath: string;
  platform: UpdatePlatform;
  timeoutMs?: number;
  preferencesPath?: string;
  checkUpdate?: (signal: AbortSignal) => Promise<UpdateDecision>;
  installUpdate?: (
    decision: Extract<UpdateDecision, { type: "update-available" }>,
  ) => Promise<SelfUpdateResult>;
}

export interface StartupUpdateResult {
  messages: string[];
}

export const runStartupUpdateCheck = async (
  options: StartupUpdateCheckOptions,
): Promise<StartupUpdateResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);

  try {
    const preferences = await loadUpdatePreferences(
      options.preferencesPath ?? defaultUpdatePreferencesPath(),
    );
    if (!preferences.enabled) return { messages: [] };

    const decision = await (
      options.checkUpdate ?? defaultUpdateCheck(options, preferences.channel)
    )(controller.signal);
    if (decision.type === "up-to-date") return { messages: [] };
    if (decision.type === "update-available") {
      const install = await (options.installUpdate ?? defaultInstall(options))(decision);
      if (install.type === "installed") {
        return {
          messages: [`Updated Stasium to ${decision.latestVersion}. Restart Stasium to use it.`],
        };
      }
      if (install.type === "manual") {
        return { messages: [`Stasium ${decision.latestVersion} is available: ${install.url}`] };
      }
      return { messages: [`Stasium update failed: ${install.reason}`] };
    }

    if (decision.type === "unsupported-platform") {
      return {
        messages: [
          `Stasium ${decision.latestVersion} is available, but no ${decision.platform.os}-${decision.platform.arch} artifact was found.`,
        ],
      };
    }

    return { messages: [`Stasium update skipped: ${decision.reason}`] };
  } catch (error) {
    return { messages: [`Stasium update check failed: ${getErrorMessage(error)}`] };
  } finally {
    clearTimeout(timeout);
  }
};

const defaultUpdateCheck = (
  options: StartupUpdateCheckOptions,
  channel: string,
): ((signal: AbortSignal) => Promise<UpdateDecision>) => {
  const updateChannel = new GitHubUpdateChannel({ repository: "modoterra/stasium" });
  return (signal) =>
    updateChannel.check({
      currentVersion: options.currentVersion,
      channel,
      platform: options.platform,
      signal,
    });
};

const defaultInstall = (
  options: StartupUpdateCheckOptions,
): ((
  decision: Extract<UpdateDecision, { type: "update-available" }>,
) => Promise<SelfUpdateResult>) => {
  const installer = new SelfUpdateInstaller({
    executablePath: options.executablePath,
    tempDir: defaultSelfUpdateTempDir(options.executablePath),
  });
  return (decision) => installer.install(decision.artifact);
};

export const currentUpdatePlatform = (): UpdatePlatform => ({
  os: process.platform === "darwin" ? "macos" : process.platform,
  arch: process.arch,
});
