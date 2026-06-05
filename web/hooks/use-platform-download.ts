import { useMemo } from "react";

import { findDownload, type DownloadId } from "../data/downloads";

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

const normalize = (value: string | undefined) => value?.toLowerCase() ?? "";

export const detectDownloadId = (navigatorLike: NavigatorWithUserAgentData): DownloadId => {
  const platform = normalize(navigatorLike.userAgentData?.platform || navigatorLike.platform);
  const userAgent = normalize(navigatorLike.userAgent);
  const combined = `${platform} ${userAgent}`;

  if (combined.includes("mac")) return "macos-arm64";
  if (combined.includes("win")) return "windows-x64";

  if (combined.includes("linux")) {
    if (combined.includes("aarch64") || combined.includes("arm64")) return "linux-arm64";
    if (
      combined.includes("x86_64") ||
      combined.includes("x64") ||
      combined.includes("amd64") ||
      combined.includes("x11")
    ) {
      return "linux-x64";
    }
  }

  return "unknown";
};

export function usePlatformDownload() {
  return useMemo(() => {
    if (typeof navigator === "undefined") return findDownload("unknown");
    return findDownload(detectDownloadId(navigator));
  }, []);
}
