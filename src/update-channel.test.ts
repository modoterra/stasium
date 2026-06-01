import { describe, expect, test } from "bun:test";
import { decideUpdate } from "./update-channel";

describe("Update Channel decision model", () => {
  test("selects a newer release artifact for the requested platform", () => {
    const decision = decideUpdate({
      currentVersion: "0.1.0",
      channel: "stable",
      platform: { os: "linux", arch: "x64" },
      releases: [
        {
          version: "0.2.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "update-available",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      channel: "stable",
      artifact: {
        platform: { os: "linux", arch: "x64" },
        name: "stasium-linux-x64",
        url: "https://example.com/stasium-linux-x64",
        sha256: "abc123",
      },
    });
  });

  test("reports up to date when the channel has no newer release", () => {
    const decision = decideUpdate({
      currentVersion: "0.2.0",
      channel: "stable",
      platform: { os: "linux", arch: "x64" },
      releases: [
        {
          version: "0.2.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
        {
          version: "0.1.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/old/stasium-linux-x64",
              sha256: "def456",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "up-to-date",
      currentVersion: "0.2.0",
      channel: "stable",
    });
  });

  test("reports unsupported platform when a newer release has no matching artifact", () => {
    const decision = decideUpdate({
      currentVersion: "0.1.0",
      channel: "stable",
      platform: { os: "linux", arch: "arm64" },
      releases: [
        {
          version: "0.2.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "unsupported-platform",
      currentVersion: "0.1.0",
      latestVersion: "0.2.0",
      channel: "stable",
      platform: { os: "linux", arch: "arm64" },
    });
  });

  test("reports unavailable channel when no release belongs to the selected channel", () => {
    const decision = decideUpdate({
      currentVersion: "0.1.0",
      channel: "stable",
      platform: { os: "linux", arch: "x64" },
      releases: [
        {
          version: "0.2.0",
          channel: "nightly",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "channel-unavailable",
      currentVersion: "0.1.0",
      channel: "stable",
      reason: "No releases found for channel stable.",
    });
  });

  test("reports failure when version metadata is invalid", () => {
    const decision = decideUpdate({
      currentVersion: "0.1.0",
      channel: "stable",
      platform: { os: "linux", arch: "x64" },
      releases: [
        {
          version: "next",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "failure",
      currentVersion: "0.1.0",
      channel: "stable",
      reason: 'Invalid update version "next".',
    });
  });

  test("reports failure when the current version is invalid", () => {
    const decision = decideUpdate({
      currentVersion: "dev",
      channel: "stable",
      platform: { os: "linux", arch: "x64" },
      releases: [
        {
          version: "0.2.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "linux", arch: "x64" },
              name: "stasium-linux-x64",
              url: "https://example.com/stasium-linux-x64",
              sha256: "abc123",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "failure",
      currentVersion: "dev",
      channel: "stable",
      reason: 'Invalid current version "dev".',
    });
  });

  test("selects the newest release from unordered channel metadata", () => {
    const decision = decideUpdate({
      currentVersion: "0.1.0",
      channel: "stable",
      platform: { os: "macos", arch: "arm64" },
      releases: [
        {
          version: "0.2.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "macos", arch: "arm64" },
              name: "stasium-macos-arm64",
              url: "https://example.com/0.2.0/stasium-macos-arm64",
              sha256: "older",
            },
          ],
        },
        {
          version: "0.3.0",
          channel: "stable",
          artifacts: [
            {
              platform: { os: "macos", arch: "arm64" },
              name: "stasium-macos-arm64",
              url: "https://example.com/0.3.0/stasium-macos-arm64",
              sha256: "newer",
            },
          ],
        },
      ],
    });

    expect(decision).toEqual({
      type: "update-available",
      currentVersion: "0.1.0",
      latestVersion: "0.3.0",
      channel: "stable",
      artifact: {
        platform: { os: "macos", arch: "arm64" },
        name: "stasium-macos-arm64",
        url: "https://example.com/0.3.0/stasium-macos-arm64",
        sha256: "newer",
      },
    });
  });
});
