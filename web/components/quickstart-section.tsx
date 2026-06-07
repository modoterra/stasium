import { ClipboardCheck, HelpCircle, Play, Search } from "lucide-react";

import { CopyCommand } from "./copy-command";

const firstRunSteps = [
  {
    Icon: Search,
    title: "Discover",
    body: "No Manifest yet? Stasium opens Project Setup and scans your Project in Discovery, then suggests commands as proposed Candidates.",
  },
  {
    Icon: ClipboardCheck,
    title: "Review",
    body: "Pick the commands you want in Candidate Selection. Approved Candidates become Process Definitions in the Manifest.",
  },
  {
    Icon: Play,
    title: "Run",
    body: "Start everything with Startup. Stasium opens the Workspace, keeps Process Output visible, and leaves Shutdown ready when you are done.",
  },
];

export function QuickstartSection() {
  return (
    <section id="quickstart" className="scroll-mt-28 bg-[#e8e0d2] px-4 py-16 dark:bg-[#0d1118]">
      <div className="mx-auto max-w-6xl">
        <div className="flex max-w-3xl flex-col gap-5">
          <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            Run one command.
          </h2>
          <p className="max-w-2xl pt-1 text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
            First run starts Project Setup. Later runs reuse the Manifest.
          </p>
        </div>

        <div className="mt-10 max-w-3xl">
          <CopyCommand label="First run" command="stasium" />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {firstRunSteps.map((step) => (
            <article
              key={step.title}
              className="relative flex flex-col gap-4 overflow-hidden bg-[#f3ecdf] p-5 dark:bg-white/[0.04]"
            >
              <div className="absolute right-6 top-6 grid size-10 place-items-center bg-[#155cff]/10 text-[#155cff] dark:bg-white/10 dark:text-[#8ab2ff]">
                <step.Icon className="size-4" />
              </div>
              <div className="mt-3 flex flex-col gap-3">
                <h3 className="text-xl font-semibold tracking-[-0.035em]">{step.title}</h3>
                <p className="text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
                  {step.body}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 bg-[#f3ecdf]/70 p-4 text-[#4d453e] dark:bg-white/[0.05] dark:text-[#d8d0c6] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-5 text-[#155cff] dark:text-[#8ab2ff]" />
            <p>
              Need the command list? Run{" "}
              <span className="font-['JetBrains_Mono_Variable']">stasium help</span>.
            </p>
          </div>
          <p className="text-sm text-[#6f6862] dark:text-[#c8c1b8]">
            You can edit the Manifest later as the Project changes.
          </p>
        </div>
      </div>
    </section>
  );
}
