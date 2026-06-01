import { describe, expect, test } from "bun:test";
import { GitHubUpdateChannel } from "./github-update-channel";

describe("GitHub Update Channel", () => {
  test("reads stable release metadata into an update decision", async () => {
    const channel = new GitHubUpdateChannel({
      repository: "modoterra/stasium",
      fetchText: async (url) => ({
        ok:
          url ===
          "https://github.com/modoterra/stasium/releases/latest/download/update-stable.json",
        text: async () =>
          JSON.stringify({
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
          }),
      }),
    });

    await expect(
      channel.check({
        currentVersion: "0.1.0",
        platform: { os: "linux", arch: "x64" },
      }),
    ).resolves.toEqual({
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

  test("reports unavailable metadata without throwing", async () => {
    const channel = new GitHubUpdateChannel({
      repository: "modoterra/stasium",
      fetchText: async () => ({ ok: false, text: async () => "" }),
    });

    await expect(
      channel.check({ currentVersion: "0.1.0", platform: { os: "linux", arch: "x64" } }),
    ).resolves.toEqual({
      type: "channel-unavailable",
      currentVersion: "0.1.0",
      channel: "stable",
      reason: "Update metadata unavailable for channel stable.",
    });
  });

  test("reports malformed metadata as a failure", async () => {
    const channel = new GitHubUpdateChannel({
      repository: "modoterra/stasium",
      fetchText: async () => ({ ok: true, text: async () => "not json" }),
    });

    const decision = await channel.check({
      currentVersion: "0.1.0",
      platform: { os: "linux", arch: "x64" },
    });

    expect(decision.type).toBe("failure");
  });
});
