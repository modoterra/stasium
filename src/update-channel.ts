export type UpdateChannelName = "stable" | string;

export type UpdatePlatform = {
  os: "linux" | "macos" | "windows" | string;
  arch: "x64" | "arm64" | string;
};

export interface UpdateArtifact {
  platform: UpdatePlatform;
  name: string;
  url: string;
  sha256: string;
}

export interface UpdateRelease {
  version: string;
  channel: UpdateChannelName;
  artifacts: UpdateArtifact[];
}

export interface UpdateDecisionInput {
  currentVersion: string;
  channel: UpdateChannelName;
  platform: UpdatePlatform;
  releases: UpdateRelease[];
}

export type UpdateDecision =
  | {
      type: "update-available";
      currentVersion: string;
      latestVersion: string;
      channel: UpdateChannelName;
      artifact: UpdateArtifact;
    }
  | {
      type: "up-to-date";
      currentVersion: string;
      channel: UpdateChannelName;
    }
  | {
      type: "unsupported-platform";
      currentVersion: string;
      latestVersion: string;
      channel: UpdateChannelName;
      platform: UpdatePlatform;
    }
  | {
      type: "channel-unavailable";
      currentVersion: string;
      channel: UpdateChannelName;
      reason: string;
    }
  | {
      type: "failure";
      currentVersion: string;
      channel: UpdateChannelName;
      reason: string;
    };

const parseVersion = (version: string): number[] | null => {
  const parts = version.split(".");
  if (parts.length !== 3) return null;
  const parsed = parts.map((part) => Number(part));
  if (parsed.some((part) => !Number.isInteger(part) || part < 0)) return null;
  return parsed;
};

const compareVersions = (left: string, right: string): number | null => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
};

export const decideUpdate = (input: UpdateDecisionInput): UpdateDecision => {
  if (!parseVersion(input.currentVersion)) {
    return {
      type: "failure",
      currentVersion: input.currentVersion,
      channel: input.channel,
      reason: `Invalid current version "${input.currentVersion}".`,
    };
  }

  const channelReleases = input.releases.filter((entry) => entry.channel === input.channel);
  let release = channelReleases[0];

  for (const candidate of channelReleases.slice(1)) {
    if (!release) {
      release = candidate;
      continue;
    }

    const versionComparison = compareVersions(candidate.version, release.version);
    if (versionComparison === null) {
      return {
        type: "failure",
        currentVersion: input.currentVersion,
        channel: input.channel,
        reason: `Invalid update version "${candidate.version}".`,
      };
    }

    if (versionComparison > 0) release = candidate;
  }

  if (!release) {
    return {
      type: "channel-unavailable",
      currentVersion: input.currentVersion,
      channel: input.channel,
      reason: `No releases found for channel ${input.channel}.`,
    };
  }

  const versionComparison = compareVersions(release.version, input.currentVersion);
  if (versionComparison === null) {
    return {
      type: "failure",
      currentVersion: input.currentVersion,
      channel: input.channel,
      reason: `Invalid update version "${release.version}".`,
    };
  }

  if (versionComparison <= 0) {
    return {
      type: "up-to-date",
      currentVersion: input.currentVersion,
      channel: input.channel,
    };
  }

  const artifact = release.artifacts.find(
    (entry) =>
      entry.platform.os === input.platform.os && entry.platform.arch === input.platform.arch,
  );
  if (!artifact) {
    return {
      type: "unsupported-platform",
      currentVersion: input.currentVersion,
      latestVersion: release.version,
      channel: input.channel,
      platform: input.platform,
    };
  }

  return {
    type: "update-available",
    currentVersion: input.currentVersion,
    latestVersion: release.version,
    channel: input.channel,
    artifact,
  };
};
