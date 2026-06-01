import { chmod, copyFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { UpdateArtifact } from "./update-channel";
import { getErrorMessage } from "./shared";

type DownloadArtifact = (url: string) => Promise<Uint8Array>;

export interface SelfUpdateInstallerOptions {
  executablePath: string;
  tempDir: string;
  downloadArtifact?: DownloadArtifact;
  platform?: NodeJS.Platform;
}

export type SelfUpdateResult =
  | { type: "installed"; path: string }
  | { type: "manual"; reason: string; url: string }
  | { type: "failed"; reason: string };

export class SelfUpdateInstaller {
  private readonly executablePath: string;
  private readonly tempDir: string;
  private readonly downloadArtifact: DownloadArtifact;
  private readonly platform: NodeJS.Platform;

  constructor(options: SelfUpdateInstallerOptions) {
    this.executablePath = options.executablePath;
    this.tempDir = options.tempDir;
    this.downloadArtifact = options.downloadArtifact ?? downloadWithFetch;
    this.platform = options.platform ?? process.platform;
  }

  async install(artifact: UpdateArtifact): Promise<SelfUpdateResult> {
    let executableStat;
    try {
      executableStat = await stat(this.executablePath);
    } catch (error) {
      return { type: "manual", reason: getErrorMessage(error), url: artifact.url };
    }

    if (!executableStat.isFile()) {
      return { type: "manual", reason: "Current executable is not a file.", url: artifact.url };
    }

    if (!basename(this.executablePath).startsWith("stasium")) {
      return {
        type: "manual",
        reason: "Current executable does not look like a Stasium binary.",
        url: artifact.url,
      };
    }

    try {
      const contents = await this.downloadArtifact(artifact.url);
      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual !== artifact.sha256) {
        return { type: "failed", reason: "Downloaded update checksum did not match metadata." };
      }

      await mkdir(this.tempDir, { recursive: true });
      const nextPath = join(this.tempDir, artifact.name);
      const backupPath = join(this.tempDir, `${artifact.name}.previous`);
      await writeFile(nextPath, contents);
      if (this.platform !== "win32") await chmod(nextPath, 0o755);
      await copyFile(this.executablePath, backupPath);
      await rename(nextPath, this.executablePath);
      return { type: "installed", path: this.executablePath };
    } catch (error) {
      return { type: "manual", reason: getErrorMessage(error), url: artifact.url };
    }
  }
}

const downloadWithFetch: DownloadArtifact = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

export const defaultSelfUpdateTempDir = (executablePath: string): string =>
  join(dirname(executablePath), ".stasium-update");
