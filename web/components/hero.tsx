import { Check, Download } from "lucide-react";

import { rotatingCommands } from "../data/commands";
import { useRotatingCommand } from "../hooks/use-rotating-command";
import { WorkspaceMockup } from "./workspace-mockup";

export function Hero() {
  const command = useRotatingCommand(rotatingCommands);

  return (
    <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#155cff] px-4 pt-28 text-white dark:bg-[#0b3bb9]">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:128px_128px] opacity-70" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle,rgba(255,255,255,0.28)_0_5px,transparent_6px)] bg-[size:128px_128px] opacity-50" />
      <div className="absolute bottom-0 left-0 right-0 -z-10 h-24 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_12px)] opacity-60" />

      <div className="mx-auto flex max-w-7xl flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 bg-white/12 px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
          <span className="grid size-5 place-items-center bg-white text-[#155cff]">
            <Check className="size-4" />
          </span>
          Run the Project you already have.
        </div>

        <h1 className="mt-10 max-w-6xl text-balance text-[clamp(3.2rem,8vw,8.25rem)] font-semibold leading-[0.95] tracking-[-0.065em]">
          Replace{" "}
          <code className="inline-block min-w-[9ch] bg-white px-3 py-1 font-['JetBrains_Mono_Variable'] text-[0.72em] leading-none tracking-[-0.06em] text-[#155cff]">
            {command}
          </code>{" "}
          guesswork.
        </h1>

        <p className="mt-7 max-w-3xl text-pretty text-xl leading-8 text-white/88">
          Stasium is a local development tool that discovers the commands your Project needs and
          runs them from one terminal Workspace.
        </p>

        <p className="mt-4 max-w-2xl text-pretty text-lg leading-7 text-white/78">
          Run <span className="font-['JetBrains_Mono_Variable']">stasium</span>. Review the proposed
          commands. Start your Development Stack.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <a
            className="inline-flex min-w-48 items-center justify-center bg-white px-7 py-4 font-semibold text-[#155cff] shadow-[0_14px_40px_rgba(0,0,0,0.18)] transition hover:bg-[#edf3ff]"
            href="#install"
          >
            Install Stasium
            <Download className="ml-2 size-4" />
          </a>
          <a
            className="inline-flex min-w-48 items-center justify-center bg-white/10 px-7 py-4 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.34)] transition hover:bg-white/15"
            href="#quickstart"
          >
            See quickstart
          </a>
        </div>

        <WorkspaceMockup />
      </div>
    </section>
  );
}
