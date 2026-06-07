import { Download, ShieldCheck, Terminal } from "lucide-react";

import {
  afterDownloadCommand,
  checksumsUrl,
  downloadOptions,
  latestReleaseUrl,
  sourceBuildCommand,
} from "../data/downloads";
import { usePlatformDownload } from "../hooks/use-platform-download";
import { CopyCommand } from "./copy-command";

export function InstallSection() {
  const recommended = usePlatformDownload();

  return (
    <section id="install" className="scroll-mt-28 bg-[#f2eee3] px-4 py-16 dark:bg-[#08090d]">
      <div className="mx-auto max-w-6xl">
        <div className="flex max-w-3xl flex-col gap-5">
          <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            Get Stasium onto your path.
          </h2>
          <p className="max-w-2xl pt-1 text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
            Download a binary, make it executable, run `stasium`.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-4 bg-[#f7f1e6] p-5 dark:bg-white/[0.04]">
            <div className="flex items-center justify-between gap-4">
              <p className="font-['JetBrains_Mono_Variable'] text-xs uppercase tracking-[0.12em] text-[#6a625d] dark:text-[#c9c2ba]">
                Recommended download
              </p>
              <Terminal className="size-5 text-[#155cff] dark:text-[#8ab2ff]" />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <h3 className="text-3xl font-semibold tracking-[-0.05em]">{recommended.label}</h3>
              <p className="font-['JetBrains_Mono_Variable'] text-sm text-[#6f6862] dark:text-[#c8c1b8]">
                {recommended.fileName}
              </p>
            </div>
            <a
              className="inline-flex min-h-11 w-full items-center justify-center bg-[#155cff] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0047e8]"
              href={recommended.href}
            >
              {recommended.id === "unknown"
                ? "View all releases"
                : `Download for ${recommended.shortLabel}`}
              <Download className="ml-2 size-4" />
            </a>

            <div className="flex flex-wrap gap-2 text-sm">
              {downloadOptions.map((option) => (
                <a
                  key={option.id}
                  className="bg-[#efe7d8] px-3 py-2 text-[#4d453e] transition hover:bg-white hover:text-[#155cff] dark:bg-white/10 dark:text-[#d8d0c6] dark:hover:bg-white/16 dark:hover:text-[#8ab2ff]"
                  href={option.href}
                >
                  {option.shortLabel}
                </a>
              ))}
              <a
                className="bg-[#efe7d8] px-3 py-2 text-[#4d453e] transition hover:bg-white hover:text-[#155cff] dark:bg-white/10 dark:text-[#d8d0c6] dark:hover:bg-white/16 dark:hover:text-[#8ab2ff]"
                href={latestReleaseUrl}
              >
                All releases
              </a>
            </div>

            <a
              className="inline-flex items-center text-sm font-medium text-[#155cff] dark:text-[#8ab2ff]"
              href={checksumsUrl}
            >
              <ShieldCheck className="mr-2 size-4" /> Verify with checksums.txt
            </a>

            <p className="text-sm leading-6 text-[#6f6862] dark:text-[#c8c1b8]">
              Windows: download `stasium-windows-x64.exe`, rename it to `stasium.exe` if you want,
              and run it from PowerShell or place it on PATH.
            </p>
          </div>

          <div className="grid gap-4">
            <CopyCommand label="After download on macOS/Linux" command={afterDownloadCommand} />
            <CopyCommand label="Build from source" command={sourceBuildCommand} />
          </div>
        </div>
      </div>
    </section>
  );
}
