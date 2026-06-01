import { describe, expect, test } from "bun:test";
import { generateUpdateMetadata, parseChecksums } from "./update-release-metadata";

describe("release update metadata", () => {
  test("generates stable channel metadata for published release assets", () => {
    const metadata = generateUpdateMetadata({
      version: "v0.2.0",
      baseUrl: "https://github.com/modoterra/stasium/releases/download/v0.2.0",
      checksums: parseChecksums(
        [
          "aaa  stasium-linux-x64",
          "bbb  stasium-linux-arm64",
          "ccc  stasium-macos-arm64",
          "ddd  stasium-windows-x64.exe",
          "eee  checksums.txt",
        ].join("\n"),
      ),
    });

    expect(metadata).toEqual({
      version: "0.2.0",
      channel: "stable",
      artifacts: [
        {
          platform: { os: "linux", arch: "x64" },
          name: "stasium-linux-x64",
          url: "https://github.com/modoterra/stasium/releases/download/v0.2.0/stasium-linux-x64",
          sha256: "aaa",
        },
        {
          platform: { os: "linux", arch: "arm64" },
          name: "stasium-linux-arm64",
          url: "https://github.com/modoterra/stasium/releases/download/v0.2.0/stasium-linux-arm64",
          sha256: "bbb",
        },
        {
          platform: { os: "macos", arch: "arm64" },
          name: "stasium-macos-arm64",
          url: "https://github.com/modoterra/stasium/releases/download/v0.2.0/stasium-macos-arm64",
          sha256: "ccc",
        },
        {
          platform: { os: "windows", arch: "x64" },
          name: "stasium-windows-x64.exe",
          url: "https://github.com/modoterra/stasium/releases/download/v0.2.0/stasium-windows-x64.exe",
          sha256: "ddd",
        },
      ],
    });
  });
});
