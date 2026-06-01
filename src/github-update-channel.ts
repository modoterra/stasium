import {
  decideUpdate,
  type UpdateChannelName,
  type UpdateDecision,
  type UpdatePlatform,
  type UpdateRelease,
} from "./update-channel";
import { getErrorMessage } from "./shared";

type FetchText = (
  url: string,
  options?: RequestInit,
) => Promise<{ ok: boolean; text: () => Promise<string> }>;

export interface GitHubUpdateChannelOptions {
  repository: string;
  fetchText?: FetchText;
  metadataUrl?: string;
}

export interface CheckGitHubUpdateInput {
  currentVersion: string;
  channel?: UpdateChannelName;
  platform: UpdatePlatform;
  signal?: AbortSignal;
}

export class GitHubUpdateChannel {
  private readonly repository: string;
  private readonly fetchText: FetchText;
  private readonly metadataUrl?: string;

  constructor(options: GitHubUpdateChannelOptions) {
    this.repository = options.repository;
    this.fetchText = options.fetchText ?? fetch;
    this.metadataUrl = options.metadataUrl;
  }

  async check(input: CheckGitHubUpdateInput): Promise<UpdateDecision> {
    const channel = input.channel ?? "stable";
    try {
      const response = await this.fetchText(this.resolveMetadataUrl(channel), {
        signal: input.signal,
      });
      if (!response.ok) {
        return {
          type: "channel-unavailable",
          currentVersion: input.currentVersion,
          channel,
          reason: `Update metadata unavailable for channel ${channel}.`,
        };
      }

      const release = JSON.parse(await response.text()) as UpdateRelease;
      return decideUpdate({
        currentVersion: input.currentVersion,
        channel,
        platform: input.platform,
        releases: [release],
      });
    } catch (error) {
      return {
        type: "failure",
        currentVersion: input.currentVersion,
        channel,
        reason: `Failed to read Update Channel: ${getErrorMessage(error)}`,
      };
    }
  }

  private resolveMetadataUrl(channel: UpdateChannelName): string {
    return (
      this.metadataUrl ??
      `https://github.com/${this.repository}/releases/latest/download/update-${channel}.json`
    );
  }
}
