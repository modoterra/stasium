import { Download } from "lucide-react";

export function Hero() {
  return (
    <section className="bg-[#101827] px-4 pb-14 pt-24 text-white sm:pt-32 dark:bg-[#070a10]">
      <div className="mx-auto max-w-6xl">
        <h1 className="max-w-2xl text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.045em] text-white">
          Start your project from one terminal.
        </h1>

        <div className="mt-8 flex max-w-2xl flex-col gap-6">
          <p className="text-base leading-7 text-white/82 sm:text-lg">
            Stasium discovers your Project commands, writes them to a plain Manifest, and runs your
            Development Stack in one Workspace.
          </p>

          <p className="text-base leading-7 text-white/68">
            It replaces scattered local startup commands like{" "}
            <code className="align-baseline font-['JetBrains_Mono_Variable'] text-[0.9em] leading-none text-white/86">
              npm run dev
            </code>
            , <span className="font-['JetBrains_Mono_Variable']">docker compose up</span>, and
            framework-specific server commands.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            className="inline-flex min-h-11 items-center justify-center bg-[#fff7df] px-5 py-3 text-sm font-semibold text-[#155cff] transition hover:bg-white sm:w-auto"
            href="#install"
          >
            Install Stasium
            <Download className="ml-2 size-4" />
          </a>
          <a
            className="inline-flex min-h-11 items-center justify-center bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            href="#quickstart"
          >
            See quickstart
          </a>
        </div>
      </div>
    </section>
  );
}
