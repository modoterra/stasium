const releaseDownloadBase = "https://github.com/modoterra/stasium/releases/latest/download";

export const latestReleaseUrl = "https://github.com/modoterra/stasium/releases/latest";
export const checksumsUrl = `${releaseDownloadBase}/checksums.txt`;

export type DownloadId = "macos-arm64" | "linux-x64" | "linux-arm64" | "windows-x64" | "unknown";

export type DownloadOption = {
  id: DownloadId;
  label: string;
  shortLabel: string;
  href: string;
  fileName: string;
};

export const downloadOptions: DownloadOption[] = [
  {
    id: "macos-arm64",
    label: "macOS Apple Silicon",
    shortLabel: "macOS",
    href: `${releaseDownloadBase}/stasium-macos-arm64`,
    fileName: "stasium-macos-arm64",
  },
  {
    id: "linux-x64",
    label: "Linux x64",
    shortLabel: "Linux x64",
    href: `${releaseDownloadBase}/stasium-linux-x64`,
    fileName: "stasium-linux-x64",
  },
  {
    id: "linux-arm64",
    label: "Linux ARM64",
    shortLabel: "Linux ARM64",
    href: `${releaseDownloadBase}/stasium-linux-arm64`,
    fileName: "stasium-linux-arm64",
  },
  {
    id: "windows-x64",
    label: "Windows x64",
    shortLabel: "Windows",
    href: `${releaseDownloadBase}/stasium-windows-x64.exe`,
    fileName: "stasium-windows-x64.exe",
  },
];

export const unknownDownload: DownloadOption = {
  id: "unknown",
  label: "All releases",
  shortLabel: "All releases",
  href: latestReleaseUrl,
  fileName: "GitHub Releases",
};

export const findDownload = (id: DownloadId) =>
  downloadOptions.find((option) => option.id === id) ?? unknownDownload;

export const afterDownloadCommand = `chmod +x stasium-*\nsudo mv stasium-* /usr/local/bin/stasium\nstasium`;

export const sourceBuildCommand = `git clone https://github.com/modoterra/stasium.git\ncd stasium\nbun install\nbun run build:cli\n./dist/stasium\n\n# optional: install on PATH\nsudo mv ./dist/stasium /usr/local/bin/stasium\nstasium`;
