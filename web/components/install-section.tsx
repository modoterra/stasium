import { Download, ShieldCheck } from "lucide-react";

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
    <section id="install" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-36 dark:bg-[#101113]">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
            <Download className="size-4" /> Install
          </div>
          <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
            Get Stasium onto your path.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            Download a release binary, make it executable, and run `stasium` in your Project.
          </p>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-white p-6 shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:bg-white/5 dark:shadow-none">
            <p className="font-['JetBrains_Mono_Variable'] text-xs uppercase tracking-[0.12em] text-[#6a625d] dark:text-[#c9c2ba]">
              Recommended download
            </p>
            <h3 className="mt-5 text-3xl font-semibold tracking-[-0.05em]">{recommended.label}</h3>
            <p className="mt-3 font-['JetBrains_Mono_Variable'] text-sm text-[#6f6862] dark:text-[#c8c1b8]">
              {recommended.fileName}
            </p>
            <a
              className="mt-8 inline-flex w-full items-center justify-center bg-[#155cff] px-6 py-4 font-semibold text-white transition hover:bg-[#0047e8]"
              href={recommended.href}
            >
              {recommended.id === "unknown"
                ? "View all releases"
                : `Download for ${recommended.shortLabel}`}
              <Download className="ml-2 size-4" />
            </a>

            <div className="mt-8 flex flex-wrap gap-2 text-sm">
              {downloadOptions.map((option) => (
                <a
                  key={option.id}
                  className="bg-[#f0eadf] px-3 py-2 text-[#4d453e] hover:text-[#155cff] dark:bg-white/10 dark:text-[#d8d0c6] dark:hover:text-[#6ea0ff]"
                  href={option.href}
                >
                  {option.shortLabel}
                </a>
              ))}
              <a
                className="bg-[#f0eadf] px-3 py-2 text-[#4d453e] hover:text-[#155cff] dark:bg-white/10 dark:text-[#d8d0c6] dark:hover:text-[#6ea0ff]"
                href={latestReleaseUrl}
              >
                All releases
              </a>
            </div>

            <a
              className="mt-6 inline-flex items-center text-sm font-medium text-[#155cff] dark:text-[#6ea0ff]"
              href={checksumsUrl}
            >
              <ShieldCheck className="mr-2 size-4" /> Verify with checksums.txt
            </a>

            <p className="mt-6 text-sm leading-6 text-[#6f6862] dark:text-[#c8c1b8]">
              Windows: download `stasium-windows-x64.exe`, rename it to `stasium.exe` if you want,
              and run it from PowerShell or place it on PATH.
            </p>
          </div>

          <div className="grid gap-5">
            <CopyCommand label="After download on macOS/Linux" command={afterDownloadCommand} />
            <CopyCommand label="Build from source" command={sourceBuildCommand} />
          </div>
        </div>
      </div>
    </section>
  );
}
