import type { UpdateArtifact, UpdateChannelName, UpdateRelease } from "./update-channel";

export interface ReleaseAssetChecksum {
  name: string;
  sha256: string;
}

export interface GenerateUpdateMetadataInput {
  version: string;
  channel?: UpdateChannelName;
  baseUrl: string;
  checksums: ReleaseAssetChecksum[];
}

const artifactPlatforms: Record<string, UpdateArtifact["platform"]> = {
  "stasium-linux-x64": { os: "linux", arch: "x64" },
  "stasium-linux-arm64": { os: "linux", arch: "arm64" },
  "stasium-macos-arm64": { os: "macos", arch: "arm64" },
  "stasium-windows-x64.exe": { os: "windows", arch: "x64" },
};

export const parseChecksums = (contents: string): ReleaseAssetChecksum[] =>
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha256, name] = line.split(/\s+/);
      if (!sha256 || !name) throw new Error(`Invalid checksum line: ${line}`);
      return { name, sha256 };
    });

export const generateUpdateMetadata = (input: GenerateUpdateMetadataInput): UpdateRelease => {
  const artifacts = input.checksums.flatMap((checksum): UpdateArtifact[] => {
    const platform = artifactPlatforms[checksum.name];
    if (!platform) return [];
    return [
      {
        platform,
        name: checksum.name,
        url: `${input.baseUrl.replace(/\/$/, "")}/${checksum.name}`,
        sha256: checksum.sha256,
      },
    ];
  });

  return {
    version: input.version.replace(/^v/, ""),
    channel: input.channel ?? "stable",
    artifacts,
  };
};
