import { defaultSelfUpdateTempDir, SelfUpdateInstaller } from "./self-update";
import { GitHubUpdateChannel } from "./github-update-channel";
import { getErrorMessage } from "./shared";
import { currentUpdatePlatform } from "./startup-update";
import { defaultUpdatePreferencesPath, loadUpdatePreferences } from "./update-preferences";
import type { UpdateChannelName, UpdateDecision, UpdatePlatform } from "./update-channel";
import type { SelfUpdateResult } from "./self-update";
import type { CommandContext, CommandResult } from "./cli";

export interface UpdateCommandOptions {
  currentVersion: string;
  executablePath: string;
  platform?: UpdatePlatform;
  preferencesPath?: string;
  checkUpdate?: (channel: UpdateChannelName) => Promise<UpdateDecision>;
  installUpdate?: (
    decision: Extract<UpdateDecision, { type: "update-available" }>,
  ) => Promise<SelfUpdateResult>;
}

const parseUpdateArgs = (args: string[]): { checkOnly: boolean; channel?: string } => {
  let checkOnly = false;
  let channel: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      checkOnly = true;
      continue;
    }
    if (arg === "--channel") {
      const value = args[index + 1];
      if (!value) throw new Error("Missing value for --channel.");
      channel = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown update option: ${arg}`);
  }

  return { checkOnly, channel };
};

const defaultUpdateCheck = (options: UpdateCommandOptions, platform: UpdatePlatform) => {
  const updateChannel = new GitHubUpdateChannel({ repository: "modoterra/stasium" });
  return (channel: UpdateChannelName) =>
    updateChannel.check({ currentVersion: options.currentVersion, channel, platform });
};

const defaultInstallUpdate = (options: UpdateCommandOptions) => {
  const installer = new SelfUpdateInstaller({
    executablePath: options.executablePath,
    tempDir: defaultSelfUpdateTempDir(options.executablePath),
  });
  return (decision: Extract<UpdateDecision, { type: "update-available" }>) =>
    installer.install(decision.artifact);
};

export const runUpdateCommand = async (
  args: string[],
  context: CommandContext,
  options: UpdateCommandOptions,
): Promise<CommandResult> => {
  let parsed;
  try {
    parsed = parseUpdateArgs(args);
  } catch (error) {
    context.stderr(getErrorMessage(error));
    return { exitCode: 1 };
  }

  try {
    const preferences = await loadUpdatePreferences(
      options.preferencesPath ?? defaultUpdatePreferencesPath(),
    );
    const channel = parsed.channel ?? preferences.channel;
    const platform = options.platform ?? currentUpdatePlatform();
    const checkUpdate = options.checkUpdate ?? defaultUpdateCheck(options, platform);
    const decision = await checkUpdate(channel);

    if (decision.type === "up-to-date") {
      context.stdout(`Stasium ${decision.currentVersion} is up to date on ${decision.channel}.`);
      return { exitCode: 0 };
    }

    if (decision.type === "channel-unavailable" || decision.type === "failure") {
      context.stderr(decision.reason);
      return { exitCode: 1 };
    }

    if (decision.type === "unsupported-platform") {
      context.stderr(
        `Stasium ${decision.latestVersion} is available, but no ${decision.platform.os}-${decision.platform.arch} artifact was found.`,
      );
      return { exitCode: 1 };
    }

    if (parsed.checkOnly) {
      context.stdout(`Stasium ${decision.latestVersion} is available on ${decision.channel}.`);
      return { exitCode: 0 };
    }

    const installUpdate = options.installUpdate ?? defaultInstallUpdate(options);
    const result = await installUpdate(decision);
    if (result.type === "installed") {
      context.stdout(`Updated Stasium to ${decision.latestVersion}. Restart Stasium to use it.`);
      return { exitCode: 0 };
    }
    if (result.type === "manual") {
      context.stdout(`Stasium ${decision.latestVersion} is available: ${result.url}`);
      context.stderr(`Automatic update unavailable: ${result.reason}`);
      return { exitCode: 0 };
    }

    context.stderr(`Stasium update failed: ${result.reason}`);
    return { exitCode: 1 };
  } catch (error) {
    context.stderr(`Stasium update failed: ${getErrorMessage(error)}`);
    return { exitCode: 1 };
  }
};
