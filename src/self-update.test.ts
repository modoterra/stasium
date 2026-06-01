import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { SelfUpdateInstaller } from "./self-update";

const sha256 = (contents: string): string => createHash("sha256").update(contents).digest("hex");

describe("Self Update Installer", () => {
  test("installs a checksum-verified artifact safely", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-update-"));
    try {
      const executablePath = join(dir, "stasium");
      await writeFile(executablePath, "old");
      const installer = new SelfUpdateInstaller({
        executablePath,
        tempDir: join(dir, "tmp"),
        downloadArtifact: async () => new TextEncoder().encode("new"),
        platform: "linux",
      });

      await expect(
        installer.install({
          platform: { os: "linux", arch: "x64" },
          name: "stasium-linux-x64",
          url: "https://example.com/stasium-linux-x64",
          sha256: sha256("new"),
        }),
      ).resolves.toEqual({ type: "installed", path: executablePath });
      expect(await readFile(executablePath, "utf8")).toBe("new");
      expect((await stat(executablePath)).mode & 0o111).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects checksum mismatches before replacement", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-update-"));
    try {
      const executablePath = join(dir, "stasium");
      await writeFile(executablePath, "old");
      const installer = new SelfUpdateInstaller({
        executablePath,
        tempDir: join(dir, "tmp"),
        downloadArtifact: async () => new TextEncoder().encode("new"),
      });

      await expect(
        installer.install({
          platform: { os: "linux", arch: "x64" },
          name: "stasium-linux-x64",
          url: "https://example.com/stasium-linux-x64",
          sha256: sha256("different"),
        }),
      ).resolves.toEqual({
        type: "failed",
        reason: "Downloaded update checksum did not match metadata.",
      });
      expect(await readFile(executablePath, "utf8")).toBe("old");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("returns manual instructions when the executable cannot be inspected", async () => {
    const installer = new SelfUpdateInstaller({
      executablePath: "/tmp/does-not-exist-stasium",
      tempDir: "/tmp/stasium-update-test",
      downloadArtifact: async () => new Uint8Array(),
    });

    const result = await installer.install({
      platform: { os: "linux", arch: "x64" },
      name: "stasium-linux-x64",
      url: "https://example.com/stasium-linux-x64",
      sha256: sha256(""),
    });

    expect(result.type).toBe("manual");
  });

  test("does not replace executables that do not look like Stasium", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-update-"));
    try {
      const executablePath = join(dir, "bun");
      await writeFile(executablePath, "old");
      const installer = new SelfUpdateInstaller({
        executablePath,
        tempDir: join(dir, "tmp"),
        downloadArtifact: async () => new TextEncoder().encode("new"),
      });

      await expect(
        installer.install({
          platform: { os: "linux", arch: "x64" },
          name: "stasium-linux-x64",
          url: "https://example.com/stasium-linux-x64",
          sha256: sha256("new"),
        }),
      ).resolves.toEqual({
        type: "manual",
        reason: "Current executable does not look like a Stasium binary.",
        url: "https://example.com/stasium-linux-x64",
      });
      expect(await readFile(executablePath, "utf8")).toBe("old");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
