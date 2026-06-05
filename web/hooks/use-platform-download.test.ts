import { describe, expect, test } from "vitest";

import { detectDownloadId } from "./use-platform-download";

const nav = (platform: string, userAgent = "") => ({ platform, userAgent }) as Navigator;

describe("detectDownloadId", () => {
  test("detects macOS as Apple Silicon download", () => {
    expect(detectDownloadId(nav("MacIntel"))).toBe("macos-arm64");
  });

  test("detects Linux x64", () => {
    expect(detectDownloadId(nav("Linux x86_64", "X11; Linux x86_64"))).toBe("linux-x64");
  });

  test("detects Linux ARM64", () => {
    expect(detectDownloadId(nav("Linux arm64", "Linux aarch64"))).toBe("linux-arm64");
  });

  test("detects Windows x64", () => {
    expect(detectDownloadId(nav("Win32", "Windows NT 10.0; Win64; x64"))).toBe("windows-x64");
  });

  test("falls back for unknown platforms", () => {
    expect(detectDownloadId(nav("FreeBSD"))).toBe("unknown");
  });
});
